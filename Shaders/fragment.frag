#version 330 core

out vec4 out_color;

uniform vec3 iResolution;
uniform float iTime;

#define fragCoord (gl_FragCoord.xy)

// Math constants
#define M_PI 3.1415926535897932384626433832795
#define EPSILON 0.01f

// Raymarching constants
#define MAX_STEPS 300
#define MAX_DIST 100.0
#define FOV (M_PI / 2.0) // In radians

// Size of a checkerboard tile
#define CHECKERBOARD_TILE_SIZE 1.0

// Collision IDs
#define SPHERE 0
#define PLANE 1

// Signed-distance function of a sphere
float sphereSDF(in vec3 pos, in float radius, in vec3 center) {
    return length(pos + center) - radius;
}

// Signed-distance function of a plane
float planeSDF(in vec3 pos, in vec4 normal) {
    return dot(pos, normal.xyz) + normal.w;
}

// SDF of scene which tells you what you collide with
float sceneSDF(in vec3 pos, out int collision_id) {
    float d_sphere = sphereSDF(pos, 1.0, vec3(0, 0.3 * sin(iTime), 0));
    float d_plane = planeSDF(pos, vec4(0.0, 1.0, 0.0, 2.0));

    if (d_sphere <= d_plane) {
        collision_id = SPHERE;
        return d_sphere;
    } else {
        collision_id = PLANE;
        return d_plane;
    }
}

// SDF of scene which doesn't tell you what you collide with
float sceneSDF(in vec3 pos) {
    int collision_id;
    return sceneSDF(pos, collision_id);
}

// Estimate the normal off of the scene sdf
vec3 estimateNormal(in vec3 p) {
    return normalize(vec3(
            sceneSDF(vec3(p.x + EPSILON, p.y, p.z)) - sceneSDF(vec3(p.x - EPSILON, p.y, p.z)),
            sceneSDF(vec3(p.x, p.y + EPSILON, p.z)) - sceneSDF(vec3(p.x, p.y - EPSILON, p.z)),
            sceneSDF(vec3(p.x, p.y, p.z  + EPSILON)) - sceneSDF(vec3(p.x, p.y, p.z - EPSILON))
        ));
}

// The blinn-phone BRDF
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

// Determine the unit vector to march along
vec3 rayDirection(in float fieldOfView, in vec2 size, in vec2 frag_coord) {
    vec2 xy = frag_coord - size / 2.0;
    float z = size.y / tan(fieldOfView / 2.0);
    return normalize(vec3(xy, -z));
}

// The raymarching algorithm
// -------------------------
// March along a ray by the distance to the nearest object
// until that distance approaches zero (collision)
// or it exceeds the max steps or max distance
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

// Calculate penumbra shadows for free
// Algorithm sourced from Inigo Quilez
// URL: https://www.iquilezles.org/www/articles/rmshadows/rmshadows.htm
float shadow(in vec3 ray_origin, in vec3 ray_direction, in float min_t,
             in float max_t, in float k) {
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

// Determine what tile the point falls in on the checkerboard
// to colour the tile
vec3 checkerboard_color(vec3 p) {
    vec3 pos = vec3(p.x, p.y, p.z - (0.7 * iTime));

    // Checkerboard pattern
    if ((mod(pos.x,(CHECKERBOARD_TILE_SIZE * 2.0)) < CHECKERBOARD_TILE_SIZE &&
        mod(pos.z,(CHECKERBOARD_TILE_SIZE * 2.0)) > CHECKERBOARD_TILE_SIZE) ||

        (mod(pos.x,(CHECKERBOARD_TILE_SIZE * 2.0)) > CHECKERBOARD_TILE_SIZE &&
        mod(pos.z,(CHECKERBOARD_TILE_SIZE * 2.0)) < CHECKERBOARD_TILE_SIZE)) {
            // White tile
            return vec3(0.9, 0.9, 0.9);
    } else {
            // Black tile
            return vec3(0.1, 0.1, 0.1);
    }
}

// Main function
// When an object is hit, perform the math magic to colour it
vec3 calculate_color(vec3 eye, vec3 p, int collision_id, vec3 ray_dir) {

    // Determine / define blinn-phong calculation components
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
    float shadow_factor = shadow(p + shadow_ray, shadow_ray, 0.0, MAX_DIST, 8.0);

    // Add the diffuse and specular components
    vec3 blinn_phong_contribution = blinnPhongIllumination(diffuse_color, specular_color, shininess, 0.5,
                                    lightPos, lightIntensity, p, eye) * shadow_factor;
    color += blinn_phong_contribution;

    // Reflect light off of the sphere
    if (collision_id == SPHERE) {
        vec3 reflection_dir = ray_dir - (2.0 * dot(ray_dir, estimateNormal(p))
                                * estimateNormal(p));

        // March along ray till it intersects
        int collision_id;
        float dist = raymarch(p + reflection_dir, reflection_dir, collision_id);

        vec3 reflected_color;
        vec3 reflected_p = p + dist * reflection_dir;
        if (dist > MAX_DIST - EPSILON) {
            // Nothing was hit
            // Create nice gradient effect for the background
            reflected_color = vec3(0.0, .8-sqrt(reflected_p.y / 30.0), .8-sqrt(reflected_p.y / 30.0));
        } else {

            // Compute if the point of calculation is obstructed by any objects from the light
            vec3 shadow_ray = normalize(lightPos - reflected_p);
            float shadow_factor = shadow(reflected_p + shadow_ray, shadow_ray, 0.0, MAX_DIST, 8.0);

            // Add blinn-phong brdf to reflection
            reflected_color = ambient_light * ambient_color;
            reflected_color += blinnPhongIllumination(checkerboard_color(reflected_p), specular_color, shininess, 0.5,
                                                     lightPos, lightIntensity, p, eye)
                                                     * shadow_factor;
        }

        // Lerp the reflection with the sphere's original colour
        color = mix(color, reflected_color, 0.2);
    }

    return color;

}

void main() {
    vec3 ray_dir = rayDirection(FOV, iResolution.xy, fragCoord);
    vec3 eye = vec3(0, 0, 5);

    int collision_id;
    float dist = raymarch(eye, ray_dir, collision_id);

    // The closest point on the surface to the eyepoint along the view ray
    vec3 p = eye + dist * ray_dir;

    if (dist > MAX_DIST - EPSILON) {
        // Nothing was hit
        // Create nice gradient effect for the background
        out_color = vec4(0.0, .8-sqrt(p.y / 30.0), .8-sqrt(p.y / 30.0), 1.0);
    } else {
        // Something was hit
        out_color = vec4(calculate_color(eye, p, collision_id, ray_dir), 1.0);
    }

}