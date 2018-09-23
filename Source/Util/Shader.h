// 
// Created by Balajanovski on 11/09/2018.
//

#ifndef INC_3D_TETRIS_SHADER_H
#define INC_3D_TETRIS_SHADER_H

#include <stdbool.h>
#include <glad/glad.h>

typedef struct ShaderStruct * ShaderPtr;

ShaderPtr NewShader(const char *vertex_path, const char *fragment_path);

void Use(ShaderPtr shader);
void SetBool(ShaderPtr shader, const char* name, bool value);
void SetInt(ShaderPtr shader, const char* name, int value);
void SetUnsignedInt(ShaderPtr shader, const char* name, unsigned int value);
void SetFloat(ShaderPtr shader, const char* name, float value);

GLuint GetID(ShaderPtr shader);


#endif //INC_3D_TETRIS_SHADER_H
