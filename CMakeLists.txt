cmake_minimum_required(VERSION 3.6)
project(raymarcher-demo C)

set(CMAKE_C_STANDARD 99)
set(CMAKE_MODULE_PATH ${CMAKE_MODULE_PATH} "${PROJECT_SOURCE_DIR}/cmake-modules")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}")
set(CMAKE_C_FLAGS "-Wall")

find_package(GLFW 3.0.0)
message("- GLFW Located")
include_directories(${GLFW_INCLUDE_DIR})

# Define no debug
# Comment this out if you want debug mode
add_definitions(-DNDEBUG)

if(GLFW_FOUND AND (GLFW_VERSION VERSION_EQUAL 3.0 OR GLFW_VERSION VERSION_GREATER 3.0))
    add_definitions( -DGLFW_VERSION_3 )
endif()

find_package(OpenGL REQUIRED)
if (OPENGL_FOUND)
    message("- OpenGL Located")
else()
    message("- error: OpenGL not Located")
endif()
include_directories(${OPENGL_HEADER_DIR})


set(PROJECT_SOURCE_DIR ${CMAKE_SOURCE_DIR}/Source)

file(GLOB SOURCE_FILES
        "${PROJECT_SOURCE_DIR}/*.h"
        "${PROJECT_SOURCE_DIR}/*.c"

        "${PROJECT_SOURCE_DIR}/Util/*.h"
        "${PROJECT_SOURCE_DIR}/Util/*.c"

        "${PROJECT_SOURCE_DIR}/Includes/glad/*.h"
        "${PROJECT_SOURCE_DIR}/Includes/glad/*.c"
        )

add_executable(${PROJECT_NAME} ${SOURCE_FILES})

target_link_libraries(${PROJECT_NAME} LINK_PUBLIC
        ${GLFW_LIBRARIES}
        )

target_include_directories(${PROJECT_NAME} PUBLIC
        ${PROJECT_SOURCE_DIR}/Includes
        ${PROJECT_SOURCE_DIR}
        )
