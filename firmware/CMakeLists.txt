# Modified for the FPV Laptimer (github.com/bli-blu-bla/fpv-laptimer-firmware), see NOTICE.md:
# 2026-10-31 version without the tag's leading "v" (v0.1.0 -> 0.1.0).
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
# One component lock per target: the component manager rewrites the lock's
# target field on every build, so a shared file would dirty the tree (and
# PROJECT_VER) whenever the other target is built.
idf_build_set_property(DEPENDENCIES_LOCK ${CMAKE_CURRENT_LIST_DIR}/dependencies.lock.${IDF_TARGET})
# The app version INFO reports, and the one the web flasher's manifest carries
# (.github/workflows/pages.yml runs the same git describe). Set at configure
# time, so a local incremental build can lag behind HEAD.
execute_process(COMMAND git describe --tags --always --dirty
    WORKING_DIRECTORY ${CMAKE_CURRENT_LIST_DIR}
    OUTPUT_VARIABLE PROJECT_VER OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
if(NOT PROJECT_VER)
    set(PROJECT_VER "unknown")
endif()
# Tag v0.1.0 -> version 0.1.0, as the laptimer server and pages compare it.
string(REGEX REPLACE "^v([0-9])" "\\1" PROJECT_VER "${PROJECT_VER}")
# HEAD's commit time (ISO 8601), also in INFO. It changes only with HEAD, so
# version_check.py's reconfigure on a new git describe keeps it current too.
execute_process(COMMAND git log -1 --format=%cI
    WORKING_DIRECTORY ${CMAKE_CURRENT_LIST_DIR}
    OUTPUT_VARIABLE FW_COMMIT_DATE OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
if(NOT FW_COMMIT_DATE)
    set(FW_COMMIT_DATE "unknown")
endif()
# Build only our component (PlatformIO calls src/ "src") and what it requires,
# not every component in ESP-IDF. __pio_env is PlatformIO's dummy component,
# which its builder needs. A new IDF dependency goes in src/CMakeLists.txt's
# REQUIRES.
set(COMPONENTS src __pio_env)
project(widscan58)
