#version 330 core

out vec4 out_color;

uniform vec3 iResolution;
uniform float iTime;

#define fragCoord (gl_FragCoord.xy)

#define M_PI 3.1415926535897932384626433832795

#define EPSILON 0.01f

#define MAX_STEPS 256
#define MAX_DIST 100
#define MAX_REFLECTION_DEPTH 5

#define CHECKERBOARD_TILE_SIZE 1

#define SPHERE 0
#define PLANE 1

float sphereSDF(in vec3 pos, in float radius, in vec3 center) {
    return length(pos + center) - radius;
}

float planeSDF(in vec3 pos, in vec4 normal) {
    return dot(pos, normal.xyz) + normal.w;
}

// Version which tells you what you collide with
float sceneSDF(in vec3 pos, out int collision_id) {
    float d_sphere = sphereSDF(pos, 1.0, vec3(0, 0, 0));
    float d_plane = planeSDF(pos, vec4(0.0, 1.0, 0.0, 2.0));

    if (d_sphere <= d_plane) {
        collision_id = SPHERE;
        return d_sphere;
    } else {
        collision_id = PLANE;
        return d_plane;
    }
}

// Version which doesn't tell you what you collide with
float sceneSDF(in vec3 pos) {
    int collision_id;
    return sceneSDF(pos, collision_id);
}

vec3 estimateNormal(in vec3 p) {
    return normalize(vec3(
            sceneSDF(vec3(p.x + EPSILON, p.y, p.z)) - sceneSDF(vec3(p.x - EPSILON, p.y, p.z)),
            sceneSDF(vec3(p.x, p.y + EPSILON, p.z)) - sceneSDF(vec3(p.x, p.y - EPSILON, p.z)),
            sceneSDF(vec3(p.x, p.y, p.z  + EPSILON)) - sceneSDF(vec3(p.x, p.y, p.z - EPSILON))
        ));
}

vec3 blinnPhongContribForLight(in vec3 diffuse_color, in vec3 specular_color, in float alpha, in vec3 p, in vec3 eye,
                          in vec3 lightPos, in vec3 lightIntensity, in float attenuation) {
    vec3 N = estimateNormal(p);
    vec3 L = normalize(lightPos - p);
    vec3 V = normalize(eye - p);
    vec3 R = normalize(reflect(-L, N));

    float dotLN = dot(L, N);
    float dotRV = dot(R, V);

    // Light not visible from this point
    if (dotLN < 0.0) {
        return vec3(0.0, 0.0, 0.0);
    }

    // Light reflection in opposite direction as viewer, apply only diffuse lighting
    if (dotRV < 0.0) {
        return lightIntensity * (diffuse_color * dotLN) * attenuation;
    }

    // Blinn - phong calculation
    vec3 half_direction = normalize(normalize(L) + V);
    float specular = pow(max(dot(half_direction, N), 0.0), 16.0);
    return (lightIntensity * diffuse_color * dotLN * attenuation) +
           (specular_color * pow(dotRV, alpha) * specular * attenuation);
}

vec3 blinnPhongIllumination(vec3 diffuse_color,
                            vec3 specular_color, float alpha, float attenuation,
                            vec3 light_pos, float light_intensity,
                            vec3 point_pos, vec3 eye) {
    vec3 light_I = light_intensity * vec3(1.0, 1.0, 1.0);

    vec3 color = blinnPhongContribForLight(diffuse_color, specular_color, alpha, point_pos, eye,
                                  light_pos,
                                  light_I, attenuation);

    return color;
}

vec3 rayDirection(in float fieldOfView, in vec2 size, in vec2 frag_coord) {
    vec2 xy = frag_coord - size / 2.0;
    float z = size.y / tan(fieldOfView / 2.0);
    return normalize(vec3(xy, -z));
}

float sigmoid(float x) {
    return x / (1 + abs(x));
}

float raymarch(in vec3 eye, in vec3 ray_dir, out int collision_id) {
    float depth = 0.0;
    for (int i = 0; i < MAX_STEPS; ++i) {
        float d = sceneSDF(eye + depth * ray_dir, collision_id);
        if (d < EPSILON) {
            return depth;
        }
        depth += d;
        if (depth >= MAX_DIST) {
            return MAX_DIST;
        }
    }
    return MAX_DIST;
}

float raymarch(in vec3 eye, in vec3 ray_dir) {
    float depth = 0.0;
    for (int i = 0; i < MAX_STEPS; ++i) {
        float d = sceneSDF(eye + depth * ray_dir);
        if (d < EPSILON) {
            return depth;
        }
        depth += d;
        if (depth >= MAX_DIST) {
            return MAX_DIST;
        }
    }
    return MAX_DIST;
}

float shadow(in vec3 ray_origin, in vec3 ray_direction, float min_t, float max_t, float k) {
    float res = 1.0;
    for (float t = min_t; t < max_t; ) {
        float dist = sceneSDF(ray_origin + ray_direction * t);
        if (dist < EPSILON) {
            return 0.0;
        }
        res = min(res, k * dist / t);
        t += dist;
    }
    return res;
}

vec3 checkerboard_color(vec3 p) {
    // Checkerboard pattern
    if ((mod(p.x,(CHECKERBOARD_TILE_SIZE * 2)) < CHECKERBOARD_TILE_SIZE &&
        mod(p.z,(CHECKERBOARD_TILE_SIZE * 2)) > CHECKERBOARD_TILE_SIZE) ||

        (mod(p.x,(CHECKERBOARD_TILE_SIZE * 2)) > CHECKERBOARD_TILE_SIZE &&
        mod(p.z,(CHECKERBOARD_TILE_SIZE * 2)) < CHECKERBOARD_TILE_SIZE)) {
            // White tile
            return vec3(0.9, 0.9, 0.9);
    } else {
            // Black tile
            return vec3(0.1, 0.1, 0.1);
    }
}

vec3 calculate_color(vec3 eye, vec3 p, int collision_id, vec3 ray_dir) {
    vec3 ambient_color = vec3(0.2, 0.2, 0.2);
    vec3 diffuse_color;
    if (collision_id == SPHERE) {
        diffuse_color = vec3(0.0, 1.0, 1.0);
    } else if (collision_id == PLANE) {
        diffuse_color = checkerboard_color(p);
    }

    vec3 specular_color = vec3(1.0, 1.0, 1.0);
    float shininess = 20.0;

    // Light attributes
    vec3 lightPos = vec3(4.0 * sin(iTime),
                              2.0,
                              4.0 * cos(iTime));
    float lightIntensity = 1.0f;

    // Compute the ambient component of light
    vec3 ambient_light = 0.5 * vec3(1.0, 1.0, 1.0);
    vec3 color = ambient_light * ambient_color;

    // Compute if the point of calculation is obstructed by any objects from the light
    vec3 shadow_ray = normalize(lightPos - p);
    float shadow_factor = shadow(p + shadow_ray, shadow_ray, 0.0, MAX_DIST, 8);

    // Add the diffuse and specular components
    vec3 blinn_phong_contribution = blinnPhongIllumination(diffuse_color, specular_color, shininess, 0.5,
                                    lightPos, lightIntensity, p, eye) * shadow_factor;
    color += blinn_phong_contribution;

    // Reflect off of the sphere
    if (collision_id == SPHERE) {
        vec3 reflection_dir = ray_dir - (2 * dot(ray_dir, estimateNormal(p))
                                * estimateNormal(p));

        // March along ray till it intersects
        int collision_id;
        float dist = raymarch(p + reflection_dir, reflection_dir, collision_id);

        vec3 reflected_color;
        if (dist > MAX_DIST - EPSILON) {
            // Nothing was hit
            reflected_color = vec3(0, 0, 0);
        } else {
            // Position reflected onto surface of plane from sphere
            vec3 reflected_p = p + dist * reflection_dir;

            // Compute if the point of calculation is obstructed by any objects from the light
            vec3 shadow_ray = normalize(lightPos - reflected_p);
            float shadow_factor = shadow(p + shadow_ray, shadow_ray, 0.0, MAX_DIST, 8);

            reflected_color = ambient_light * ambient_color;
            reflected_color += blinnPhongIllumination(checkerboard_color(reflected_p), specular_color, shininess, 0.5,
                                                     lightPos, lightIntensity, p, eye)
                                                     * shadow_factor;
        }

        color = mix(color, reflected_color, 0.2);
    }


    return color;

}

void main() {
    vec3 ray_dir = rayDirection(M_PI / 2, iResolution.xy, fragCoord);
    vec3 eye = vec3(0, 0, 5);

    int collision_id;
    float dist = raymarch(eye, ray_dir, collision_id);

    if (dist > MAX_DIST - EPSILON) {
        // Nothing was hit
        vec2 uv = (2.*fragCoord.xy - iResolution.xy) / iResolution.y;
        out_color = vec4(0.0, .8-sqrt(uv.y), .8-sqrt(uv.y), 1.0);
    } else {
        // Something was hit
        // The closest point on the surface to the eyepoint along the view ray
        vec3 p = eye + dist * ray_dir;
        out_color = vec4(calculate_color(eye, p, collision_id, ray_dir), 1.0);
    }

}