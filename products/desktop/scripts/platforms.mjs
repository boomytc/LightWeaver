export const NODE_VERSION = "22.23.4";
export const NODE_ABI = "127";
export const PYTHON_VERSION = "3.12.16";
export const PYTHON_RELEASE = "20261026";
export const FFMPEG_VERSION = "9.0.2";
export const CHROME_VERSION = "149.0.7790.0";

const chromeUrl = (platform, file) =>
  `https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/${platform}/${file}`;

const nodePin = (name, sha256) => ({
  version: NODE_VERSION,
  url: `https://nodejs.org/dist/v${NODE_VERSION}/${name}`,
  sha256,
  root: name.replace(/\.(?:tar\.gz|zip)$/, ""),
});

const pythonPin = (target, sha256) => {
  const name = `cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-${target}-install_only.tar.gz`;
  return {
    version: PYTHON_VERSION,
    release: PYTHON_RELEASE,
    url: `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${name.replace("+", "%2B")}`,
    sha256,
    root: "python",
  };
};

const martinFfmpeg = (platform, arch, stamp) => ({
  ffmpeg: {
    url: `https://ffmpeg.martin-riedl.de/download/${platform}/${arch}/${stamp}_${FFMPEG_VERSION}/ffmpeg.zip`,
    sha256: {
      "darwin-arm64": "c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924",
      "darwin-x64": "7c6b4125b191cbf773832dc51f424cf2b6bb7da43007d1e066f95909e47cacd4",
      "linux-x64": "fa8ecf4abbd290d98f7d188b8649cc6b391ae209a98452be955a15aab1909d7f",
    }[`${platform === "macos" ? "darwin" : "linux"}-${arch === "amd64" ? "x64" : arch}`],
  },
  ffprobe: {
    url: `https://ffmpeg.martin-riedl.de/download/${platform}/${arch}/${stamp}_${FFMPEG_VERSION}/ffprobe.zip`,
    sha256: {
      "darwin-arm64": "fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6",
      "darwin-x64": "2322438ed2f6319a691291b247d09c69dcaa3a982460d1f269a7e1af335cfdfd",
      "linux-x64": "3f428c49070be3d24ec338602b76d412e401ffcb8a5641ef0e729181a232fc32",
    }[`${platform === "macos" ? "darwin" : "linux"}-${arch === "amd64" ? "x64" : arch}`],
  },
});

const macArmMedia = martinFfmpeg("macos", "arm64", "1789931890");
const macX64Media = martinFfmpeg("macos", "amd64", "1789931006");
const linuxX64Media = martinFfmpeg("linux", "amd64", "1789931100");

const windowsMedia = {
  url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-25-13-00/ffmpeg-n9.0.2-36-g6882969ce9-win64-gpl-9.0.zip",
  sha256: "941603e8e99cf92309a3faaf156479438c41e738d007dbef3e484204614cb156",
  root: "ffmpeg-n9.0.2-36-g6882969ce9-win64-gpl-9.0",
};

export const TARGETS = Object.freeze({
  "darwin-arm64": {
    platform: "darwin",
    arch: "arm64",
    electronBuilderPlatform: "mac",
    node: nodePin("node-v22.23.4-darwin-arm64.tar.gz", "c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428"),
    python: pythonPin("aarch64-apple-darwin", "fbf4afef53c2a6b72bb741bc06d5671a9dfaf87bd84e5aa73ac9b3d0d589f14e"),
    chrome: {
      version: CHROME_VERSION,
      url: chromeUrl("mac-arm64", "chrome-headless-shell-mac-arm64.zip"),
      sha256: "17ef152eba8ffcfebc42e25ab295eb040d8e62455cff7dfcc735b652456d6899",
      root: "chrome-headless-shell-mac-arm64",
    },
    mediaArchives: macArmMedia,
    mediaArtifacts: {
      ffmpeg: { archive: "ffmpeg", path: "ffmpeg" },
      ffprobe: { archive: "ffprobe", path: "ffprobe" },
    },
    remotionCompositor: "@remotion/compositor-darwin-arm64",
    tools: {
      node: "node/bin/node",
      ffmpeg: "tools/ffmpeg",
      ffprobe: "tools/ffprobe",
      supervisor: "resources/weaver/scripts/process-supervisor.mjs",
      cardRenderer: "service/render.mjs",
      cardBrowser: "card/browser/chrome-headless-shell",
      cardSite: "card/site",
      python: "python/bin/python3.12",
    },
    cliLauncher: "bin/weaver",
  },
  "darwin-x64": {
    platform: "darwin",
    arch: "x64",
    electronBuilderPlatform: "mac",
    node: nodePin("node-v22.23.4-darwin-x64.tar.gz", "efcc2b0db6f94bf53eddb038fe2b370277a042bd29e4f19b8f8e23598795b819"),
    python: pythonPin("x86_64-apple-darwin", "a962e47df522889eaa7ff0d6a56203f1079f68aabb65ffdbe8455f362bc769f3"),
    chrome: {
      version: CHROME_VERSION,
      url: chromeUrl("mac-x64", "chrome-headless-shell-mac-x64.zip"),
      sha256: "2597bf0940b54afbdfcb76519b5c8cf423cec49eea90ce1c4123456aca47a851",
      root: "chrome-headless-shell-mac-x64",
    },
    mediaArchives: macX64Media,
    mediaArtifacts: {
      ffmpeg: { archive: "ffmpeg", path: "ffmpeg" },
      ffprobe: { archive: "ffprobe", path: "ffprobe" },
    },
    remotionCompositor: "@remotion/compositor-darwin-x64",
    tools: {
      node: "node/bin/node",
      ffmpeg: "tools/ffmpeg",
      ffprobe: "tools/ffprobe",
      supervisor: "resources/weaver/scripts/process-supervisor.mjs",
      cardRenderer: "service/render.mjs",
      cardBrowser: "card/browser/chrome-headless-shell",
      cardSite: "card/site",
      python: "python/bin/python3.12",
    },
    cliLauncher: "bin/weaver",
  },
  "linux-x64": {
    platform: "linux",
    arch: "x64",
    electronBuilderPlatform: "linux",
    node: nodePin("node-v22.23.4-linux-x64.tar.gz", "b8492284c76a54baf58d61668dd0e41ee0fc98adabf9503d30f05d08f55b4406"),
    python: pythonPin("x86_64-unknown-linux-gnu", "6a79e922e50006b601f29e688407659da1c2b86ebcd4e9c7254cf234be8b89de"),
    chrome: {
      version: CHROME_VERSION,
      url: chromeUrl("linux64", "chrome-headless-shell-linux64.zip"),
      sha256: "a3b011ab4c726e215cdeb623907a09cfb48f07054a7271fdda555ee2ae4f804d",
      root: "chrome-headless-shell-linux64",
    },
    mediaArchives: linuxX64Media,
    mediaArtifacts: {
      ffmpeg: { archive: "ffmpeg", path: "ffmpeg" },
      ffprobe: { archive: "ffprobe", path: "ffprobe" },
    },
    remotionCompositor: "@remotion/compositor-linux-x64-gnu",
    tools: {
      node: "node/bin/node",
      ffmpeg: "tools/ffmpeg",
      ffprobe: "tools/ffprobe",
      supervisor: "resources/weaver/scripts/process-supervisor.mjs",
      cardRenderer: "service/render.mjs",
      cardBrowser: "card/browser/chrome-headless-shell",
      cardSite: "card/site",
      python: "python/bin/python3.12",
    },
    cliLauncher: "bin/weaver",
  },
  "win32-x64": {
    platform: "win32",
    arch: "x64",
    electronBuilderPlatform: "win",
    node: nodePin("node-v22.23.4-win-x64.zip", "cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20"),
    python: pythonPin("x86_64-pc-windows-msvc", "590dfcbe3a34c07301e6332e13e2188b98655cd072b08afa45a7998dc4c22bc5"),
    chrome: {
      version: CHROME_VERSION,
      url: chromeUrl("win64", "chrome-headless-shell-win64.zip"),
      sha256: "8a112c0e768907ff382ff994dcde35cdbd0e1f5a3a475da93d3a83e3260e78c2",
      root: "chrome-headless-shell-win64",
    },
    mediaArchives: { media: windowsMedia },
    mediaArtifacts: {
      ffmpeg: { archive: "media", path: `${windowsMedia.root}/bin/ffmpeg.exe` },
      ffprobe: { archive: "media", path: `${windowsMedia.root}/bin/ffprobe.exe` },
    },
    remotionCompositor: "@remotion/compositor-win32-x64-msvc",
    tools: {
      node: "node/node.exe",
      ffmpeg: "tools/ffmpeg.exe",
      ffprobe: "tools/ffprobe.exe",
      supervisor: "resources/weaver/scripts/process-supervisor.mjs",
      cardRenderer: "service/render.mjs",
      cardBrowser: "card/browser/chrome-headless-shell.exe",
      cardSite: "card/site",
      python: "python/python.exe",
    },
    cliLauncher: "bin/weaver.cmd",
  },
});

export const TARGET_NAMES = Object.freeze(Object.keys(TARGETS));

export function hostTarget(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

export function parsePackageTarget(args) {
  const targetArg = args.find((arg) => arg.startsWith("--target="));
  const platformArg = args.find((arg) => arg.startsWith("--platform="));
  const archArg = args.find((arg) => arg.startsWith("--arch="));
  if (targetArg && (platformArg || archArg))
    throw new Error("--target 不能与 --platform/--arch 同时使用");
  const target = targetArg
    ? targetArg.slice("--target=".length)
    : hostTarget(
        platformArg?.slice("--platform=".length) || process.platform,
        archArg?.slice("--arch=".length) || process.arch,
      );
  const definition = TARGETS[target];
  if (!definition) {
    throw new Error(
      `不支持的打包目标 ${target}；只支持 ${TARGET_NAMES.join(", ")}`,
    );
  }
  const host = hostTarget();
  if (target !== host) {
    throw new Error(
      `目标 ${target} 必须在对应主机上构建，当前主机是 ${host}；不做交叉平台打包`,
    );
  }
  return { name: target, ...definition };
}
