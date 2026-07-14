import { Config } from "@remotion/cli/config";

// Skeleton config for the demo film. The real compositions bring their own
// codec and quality settings later; this just sets sane defaults for now.
Config.setVideoImageFormat("jpeg");
Config.setPixelFormat("yuv420p");
Config.setCodec("h264");
