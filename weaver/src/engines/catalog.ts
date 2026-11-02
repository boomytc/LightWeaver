import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z, EngineCatalog, EngineCatalogItem, ModelReleaseFile } from "../contracts/index.ts";
import { currentPlatform, currentRuntime } from "../runtime.ts";

type FileSpec = z.input<typeof ModelReleaseFile>;
type BindingSpec = z.input<typeof EngineCatalogItem>["bindings"][number];
type SourceSpec = z.input<typeof EngineCatalogItem>["source"];

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);

function file(
  path: string,
  size: number,
  sha256: string,
  executable = false,
): FileSpec {
  return { path, size, sha256: SHA256.parse(sha256), executable };
}

export const TRANSCRIBE_VERSION = "0.2.0";
export const TEN_VAD_REVISION = "d68ab71c8d5fbd8f98e97ae7c9986af76b5d72b1";
export const LLAMA_SERVER_BUILD = "b12032";
const TRANSCRIBE_DOC = "https://github.com/handy-computer/transcribe.cpp";
const TEN_VAD_DOC = "https://github.com/TEN-framework/ten-vad";
const LLAMA_DOC = "https://github.com/ggml-org/llama.cpp";

const TRANSCRIBE_FILES: Record<string, FileSpec[]> = {
  "darwin-arm64": [
    file("contract.json", 113, "30b63b5dca1d58e96784da133389a154a722adbaba43fc3d64586b4b0490988d"),
    file("libggml-base.dylib", 639856, "0babc5d79b38e9bd66f429295f3e70d0f5c5b8d7bf0c8bcec4d9593fb65aca00", true),
    file("libggml-cpu.dylib", 886416, "d502fcf4a60ad55d19350ab1bb356128406e81db8788a2058addc9f1684ca0bb", true),
    file("libggml-metal.dylib", 816272, "347b5895afec79b1f5c68a7b7ef64bf93e1d64bd784b6c0cf7dbb3a4d0fd5967", true),
    file("libggml.dylib", 90896, "05d3aebd903166949477a46c4737545e5dcd6effd1d0d1918b8ee2dda44d62f8", true),
    file("libtranscribe.dylib", 1415888, "55ff7dfd986cd429bd22fd8b341708d8a61a0314676d90d13f3687af2d4bccc8", true),
  ],
  "darwin-x64": [
    file("contract.json", 102, "1eec31c53772d4906304be296e5e7b40e90760235e5f4a9598b0d3d361377684"),
    file("libggml-base.dylib", 663768, "2d34e92d06c80910994db0d47a4e87b96da3bdda82efe86012b58daaf6fd270a", true),
    file("libggml-cpu.dylib", 912224, "4bbfb002e1f3779b964af43f83e2db0bc78d3cd2f31e18069ff9d6f6c23dcc00", true),
    file("libggml.dylib", 62352, "afcd5875aa0fd8a1509cc336af5be2f9257dad34ff172f3d6ed2f06fa92dbf86", true),
    file("libtranscribe.dylib", 1661424, "e04e578c93e5718163125b06f70c820d576e53ceefaf05c89bec74fda89bf4eb", true),
  ],
  "linux-x64": [
    file("contract.json", 119, "11bc9546001b5977ea3b24a8978727c800ddad177c1fd47eb26bc0a404cd59f5"),
    file("libggml-base.so", 775808, "14bb6b593cc047f8fcf2e136e4415d11ba7885754e73447db4426e8e2d1831bc", true),
    file("libggml-cpu-alderlake.so", 1015752, "3ae13b8c9d968c19924cca05977ff2dcc1e2b4930624e9cc5aad74f9562bc955", true),
    file("libggml-cpu-cannonlake.so", 1249224, "b88c57230951c25ece1a9af86caa8d49f72ab9de3177181e6cd4770cdc2fb121", true),
    file("libggml-cpu-cascadelake.so", 1249224, "7ef70ad2c85937bc01823aa3f1a5e116208e0cae71d0c3948135ed1c1e4e581e", true),
    file("libggml-cpu-cooperlake.so", 1245128, "0a9407de483a71e2a5b846fe71ff1319c9deed155b3d9b9dd5722c1d488fddf2", true),
    file("libggml-cpu-haswell.so", 1019848, "1995ed6576ceabc748b3aa88ddf0f4e39381d9abf2546da8029cfaacad57e867", true),
    file("libggml-cpu-icelake.so", 1249224, "ae3e74ef0d976bb0906317957ea28a98d623abe30f8a5a8721ef7c868ca27a28", true),
    file("libggml-cpu-ivybridge.so", 958408, "4720f7ee313ca95d3089a2eb58436ef3ef88bdd90fa446fe140acd0b83dc292c", true),
    file("libggml-cpu-piledriver.so", 954312, "3cfd30f3c635eb9132cb5ce836d5e6c6360734f93834dcfe7cd3be7fe6437962", true),
    file("libggml-cpu-sandybridge.so", 946120, "358a3887bc45430ef8d815a0b5c1c9e83738e4a69d8b967ae686a998337fa27e", true),
    file("libggml-cpu-sapphirerapids.so", 1527960, "cf42fa0116e9d701572e04dc8bd72476077807a80d25a2166cc5c2c5cd212951", true),
    file("libggml-cpu-skylakex.so", 1249224, "72657a04a05c197fa1c922e39ebfca56984cfa960e78febd05a23e3e1d9d8958", true),
    file("libggml-cpu-sse42.so", 798664, "c867b57110dfcb91a4d2a05ad680c74025ae0e1c83a99aff7eeef58b8815e98a", true),
    file("libggml-cpu-x64.so", 765928, "6ac9b5242f059fb7c6c87db276049897c17aef550fb83fe517f3e003cb489698", true),
    file("libggml-cpu-zen4.so", 1245128, "af3df9ff5c8b426f63fc40c5c4b681f2330aff1d3e8216117845f171e6667db4", true),
    file("libggml-vulkan.so", 73784328, "27bcd646007bba4e8a734d2996c55b155e99eabf2d363225eedda332bd067db4", true),
    file("libggml.so", 220768, "3a4015d651ed69a7783970871abe0a8c5551320fe5e697a8341cc7e7b473b974", true),
    file("libtranscribe.so", 2114288, "3e3603eb39d9730945800b5d31660e4432cd9aae3d867fb3e8df356b01c5a2d9", true),
  ],
  "linux-arm64": [
    file("contract.json", 119, "11bc9546001b5977ea3b24a8978727c800ddad177c1fd47eb26bc0a404cd59f5"),
    file("libggml-base.so", 726680, "c74faa63a1a1f71d60d522e95388fad0163108541b2df4e14ead566ade61118d", true),
    file("libggml-cpu-armv8.0_1.so", 856032, "f2e97906adfb2468550f5a8bd459100145168d594582b6c2c6ec25df9dfd5d53", true),
    file("libggml-cpu-armv8.2_1.so", 921552, "cdcf3f4b737a22d136eab0577a2a642f2bb792b405a9bd5987a71f9e47093798", true),
    file("libggml-cpu-armv8.2_2.so", 921552, "3ec6fc552305c68e47014aa1c199ef29430794c59018bfeaed299aa35f686018", true),
    file("libggml-cpu-armv8.2_3.so", 921544, "c61891f126fec5d8b6bc828652a2a4a539df7b1ae2e93fa27f921ddc5886c281", true),
    file("libggml-cpu-armv8.6_1.so", 921544, "af208a7a44b8467164384617197a697afa1098f8341131e9e04447a756e7b4c0", true),
    file("libggml-cpu-armv8.6_2.so", 921544, "2e25015f0a6922dc07a9a883c471170612d7b02272b7d3c65dde755b1c3f8578", true),
    file("libggml-cpu-armv9.2_1.so", 921544, "0224b81fe2b32a3231c8dce4f32f1477effa2241f65847307da462b19a44436d", true),
    file("libggml-cpu-armv9.2_2.so", 921544, "b04883f76d6ce9e24d6bec891d0cae0a7cbf24f53e3d9521647fea8c02b912b3", true),
    file("libggml-vulkan.so", 73735328, "01aa1d6f3dacc8f8a4be43e9e92c05c4948eead55665adff3973036b61f4419c", true),
    file("libggml.so", 266016, "2cc68978bf0cc8130f57f7e33382a97a98a704ce2d666801a4b583e1d2e76bef", true),
    file("libtranscribe.so", 1774400, "bbbd38509116d412d1902188c15f9bd5f1f87cf2e91b54bb5d9c171e00e91848", true),
  ],
  "win32-x64": [
    file("contract.json", 125, "d18eae58e3628b50c91a100975cf4155ea1f3eb05d47ad15dfc420a34cf6370a"),
    file("ggml-base.dll", 637952, "313d59395e72db5859742ae40dc6949efbcc4c8c4be1710d358b5c743ebd3c72", true),
    file("ggml-cpu-alderlake.dll", 888832, "e681e96827b4456c95437a47e6f919270fdd9c3818455d7f285d22aed6078343", true),
    file("ggml-cpu-cannonlake.dll", 993792, "55b5636be15bc81dffa0e7fdde0b5776627448154c7170421dd4578d06e1941f", true),
    file("ggml-cpu-cascadelake.dll", 992256, "9cccaef7ed47eab23c1f6557b663ebacb952df2ccba0c563247d9941fb023ecd", true),
    file("ggml-cpu-haswell.dll", 890368, "3cf320b75dae351f3b3e1aa5db5dc054c776a048951f9a725672b736f60d04a2", true),
    file("ggml-cpu-icelake.dll", 992256, "e1c4828e87e8ee3daa4396c102d34eea3be092d6a12b503e5deabdcba4a308ae", true),
    file("ggml-cpu-sandybridge.dll", 834048, "9335fd2ede6f4be00781f739a57ab4adefca91496251e3db2e7cd8ea7401e182", true),
    file("ggml-cpu-skylakex.dll", 993792, "096883b33eb627724b5af9f9d6c4d06ca31a145cd629ee3040e867da3675b976", true),
    file("ggml-cpu-sse42.dll", 754176, "420b34084ccad863de08c05785bc1343268406e67b41337e35246b6da3e3adbd", true),
    file("ggml-cpu-x64.dll", 755200, "a037e886494d8485410abc0d93cac94e10e66df200cd1a4c8565b77e0339de46", true),
    file("ggml-vulkan.dll", 74008064, "18f7e8334cbdef8d17ae1a50ac40b271669ed36e3ade1ccdc1bf6bba9a49d08c", true),
    file("ggml.dll", 66560, "ce242de773a0ab6c7e25f602e9ffe23f30125c295b641509b8829d2080e01e3a", true),
    file("transcribe.dll", 1795072, "063235061dd2d0d797a01047f8c8c868cda4b1a1eba833a899a19281aace2d02", true),
  ],
};

const TRANSCRIBE_ARCHIVES: Record<
  string,
  { url: string; size: number; sha256: string; stripPrefix: string }
> = {
  "darwin-arm64": {
    url: "https://github.com/handy-computer/transcribe.cpp/releases/download/v0.2.0/transcribe-native-0.2.0-macos-arm64-metal.tar.gz",
    size: 1483992,
    sha256: "c6252907becdc720ad04ae4425a1e2867da01ad6b951637657761337dfb83d3c",
    stripPrefix: "transcribe-native-macos-arm64-metal",
  },
  "darwin-x64": {
    url: "https://github.com/handy-computer/transcribe.cpp/releases/download/v0.2.0/transcribe-native-0.2.0-macos-x86_64-cpu.tar.gz",
    size: 1423969,
    sha256: "16f6fc3c68c44f253efa27d76ae68e3461718f063e0f7dc453798ad26e59f056",
    stripPrefix: "transcribe-native-macos-x86_64-cpu",
  },
  "linux-x64": {
    url: "https://github.com/handy-computer/transcribe.cpp/releases/download/v0.2.0/transcribe-native-0.2.0-linux-x86_64-cpu-vulkan.tar.gz",
    size: 29822925,
    sha256: "8921154da3332668f40cda80eb7c4ab69b873560c3cf87dbcb9d280ef43dc604",
    stripPrefix: "transcribe-native-linux-x86_64-cpu-vulkan",
  },
  "linux-arm64": {
    url: "https://github.com/handy-computer/transcribe.cpp/releases/download/v0.2.0/transcribe-native-0.2.0-linux-aarch64-cpu-vulkan.tar.gz",
    size: 26238183,
    sha256: "ba4d0f6505775427e38fa6b1953efa171b6d79df261b532b17eb2f710cf9c219",
    stripPrefix: "transcribe-native-linux-aarch64-cpu-vulkan",
  },
  "win32-x64": {
    url: "https://github.com/handy-computer/transcribe.cpp/releases/download/v0.2.0/transcribe-native-0.2.0-windows-x86_64-cpu-vulkan.tar.gz",
    size: 26046998,
    sha256: "12ea01d9c373d989ac5b61d9b0eba8fa42e0cb5841ecb40de5b47db7ce07c14a",
    stripPrefix: "transcribe-native-windows-x86_64-cpu-vulkan",
  },
};

const BINDINGS_WHEEL = {
  url: "https://files.pythonhosted.org/packages/06/26/5565715135317dbad5d3e9c9a0721e273f4877513e75355096a873e40335/transcribe_cpp-0.2.0-py3-none-any.whl",
  size: 34388,
  sha256: "2b4ae07f8b85800eaebf8e589578cd111207e847e1bdba079c7b7c00542b2443",
};

const BINDINGS_FILES: FileSpec[] = [
  file("transcribe_cpp/__init__.py", 59706, "d208ef2ad11d7b80c072b7e3fac52979bd58faf815e1735fe04ce6963c2c3bcf"),
  file("transcribe_cpp/_abi.py", 3236, "8f98f6015353b6851d5b6003fe3a57925ee9b1a393ca488552d945254d03c8b0"),
  file("transcribe_cpp/_generated.py", 28388, "25b11ee65cc455bd3e400e79216f72dd09020fe70b530f2ce85018559800dd67"),
  file("transcribe_cpp/_library.py", 15629, "cce7021c4cd3c2a27fdf9625646d2e0db9ac2f6442a8ac5722f97a94d1d3e7b1"),
  file("transcribe_cpp/errors.py", 5071, "3400bdee2748de411543896fe1ac94e266acaea297472bb017d47b01e82cf436"),
  file("transcribe_cpp/py.typed", 0, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
];

const TEN_VAD_FILES: Record<
  string,
  { url: string; path: string; size: number; sha256: string }
> = {
  "darwin-arm64": {
    url: `https://raw.githubusercontent.com/TEN-framework/ten-vad/${TEN_VAD_REVISION}/lib/macOS/ten_vad.framework/Versions/A/ten_vad`,
    path: "ten_vad",
    size: 744600,
    sha256: "81b2de13710670bb94fef315ab50fedc903a21c04c4290c6c2ac28d8b42e715a",
  },
  "darwin-x64": {
    url: `https://raw.githubusercontent.com/TEN-framework/ten-vad/${TEN_VAD_REVISION}/lib/macOS/ten_vad.framework/Versions/A/ten_vad`,
    path: "ten_vad",
    size: 744600,
    sha256: "81b2de13710670bb94fef315ab50fedc903a21c04c4290c6c2ac28d8b42e715a",
  },
  "linux-x64": {
    url: `https://raw.githubusercontent.com/TEN-framework/ten-vad/${TEN_VAD_REVISION}/lib/Linux/x64/libten_vad.so`,
    path: "libten_vad.so",
    size: 313240,
    sha256: "5abfe6bf6e9a4fcea6b440240f0a9a0f431ab5006e48a4e16465ebe681ffd90f",
  },
  "win32-x64": {
    url: `https://raw.githubusercontent.com/TEN-framework/ten-vad/${TEN_VAD_REVISION}/lib/Windows/x64/ten_vad.dll`,
    path: "ten_vad.dll",
    size: 510464,
    sha256: "38937f5604fa93a7941db7b9326992b792fa3731ebf9353973b3234457c6064b",
  },
};

const LLAMA_ARCHIVES: Record<
  string,
  { url: string; size: number; sha256: string; stripPrefix: string; binary: string }
> = {
  "darwin-arm64": {
    url: "https://github.com/ggml-org/llama.cpp/releases/download/b12032/llama-b12032-bin-macos-arm64.tar.gz",
    size: 16513842,
    sha256: "00468fe833eb000b78a748122f5921b6c7b07dc82331a8d0c68196c69cb26382",
    stripPrefix: "llama-b12032",
    binary: "llama-server",
  },
  "darwin-x64": {
    url: "https://github.com/ggml-org/llama.cpp/releases/download/b12032/llama-b12032-bin-macos-x64.tar.gz",
    size: 12258802,
    sha256: "291d99f3b6f45f67f73afe5381540f29928840a1a14d9c19d6595bd649a035fc",
    stripPrefix: "llama-b12032",
    binary: "llama-server",
  },
  "linux-x64": {
    url: "https://github.com/ggml-org/llama.cpp/releases/download/b12032/llama-b12032-bin-ubuntu-x64.tar.gz",
    size: 22886629,
    sha256: "9f10432ca3f66ef003a7a540aaffb9da0acadaefd05404521b9ab7a2436af304",
    stripPrefix: "llama-b12032",
    binary: "llama-server",
  },
  "win32-x64": {
    url: "https://github.com/ggml-org/llama.cpp/releases/download/b12032/llama-b12032-bin-win-cpu-x64.zip",
    size: 24582754,
    sha256: "5296f5d18bb7d422c7c26f4bb9bc796d9d4f41e1312a8c296cff475bdc60d0d4",
    stripPrefix: "",
    binary: "llama-server.exe",
  },
};

const LLAMA_FILES: Record<string, FileSpec[]> = {
  "darwin-arm64": [
    file("libggml-base.0.28.0.dylib", 770552, "6009f0abc1733078240b2b2c4f058194a3c802844248fcd59d675e94d4f389d0", true),
    file("libggml-blas.0.28.0.dylib", 58776, "505df04b85bf698d39dc18c4fa6256333d1cba44e7339505cdbd1a647db3c603", true),
    file("libggml-cpu.0.28.0.dylib", 959216, "db03f3ffc662b1ff1f1b0f03260d76c6616f31e8cb9a0412c6c67330ede7dd6b", true),
    file("libggml-metal.0.28.0.dylib", 5621832, "679eabe89b05497b6c53971c2f9f18f8af4ae48e25b41be7ecb0be19bb85fbbf", true),
    file("libggml-rpc.0.28.0.dylib", 242800, "a9e9fcd3b4086e007aa826aa1c3a96885545a02b535445fbd49c1a0e0749a2ad", true),
    file("libggml.0.28.0.dylib", 60016, "c3830dd10717fdf15bd9762a8a31598b0b71a5d7ab6623c0c43793676c54ac0d", true),
    file("libllama-common.0.8.0.dylib", 8030472, "62a9a13b5eb70a37148e1d09bdb2f21d42cc291142718e068aecf8ca37aaecc0", true),
    file("libllama-server-impl.dylib", 9777672, "cb944ad7276be6d4390b3b53f2cba4aa20cdc755508f69e8b9c659e3a8cc467d", true),
    file("libllama.0.8.0.dylib", 3696416, "dfd1c90404e4c6a298b538e9e2c5d773a854b79e104ba2b561888e87cc6a707b", true),
    file("libmtmd.0.8.0.dylib", 1637392, "86c7dd751b9297b338c5bde33fc3c4f11d62e6868c82319ed7af14f1ad40121b", true),
    file("llama-server", 49984, "3d81b7997317e5ffd13ed3ba32436658e0f4067172cea3674b4215b39d4635be", true),
  ],
  "darwin-x64": [
    file("libggml-base.0.28.0.dylib", 753920, "b3fa73ba0c0152c9936ee3c96e525785032ea9c6bfcc1b8203519891a924cd98", true),
    file("libggml-blas.0.28.0.dylib", 33688, "0d87a3ab68b135d09795eb4fd871bbc5cceaa86905ebdfba3beb00bad197ef4e", true),
    file("libggml-cpu.0.28.0.dylib", 1578144, "af27c96385f856acaef5352aa106aaa05d52b16974a785c9e3cafedb3f8b88be", true),
    file("libggml-rpc.0.28.0.dylib", 220112, "662dfcb81437a0583198e88a4ad21c7fb92508b5ede54d9c356fc01bb4dae5d8", true),
    file("libggml.0.28.0.dylib", 43216, "4b123e4b5d78999af07ee2b8466ed7be30131beab07dd168623168aa954c1120", true),
    file("libllama-common.0.8.0.dylib", 8544832, "a117a19ae924ee880d6116c287fe5643fabd0370e5303560525f514f3d1f4951", true),
    file("libllama-server-impl.dylib", 10191168, "39f4c33b685e31c079a50a9a37246554a6f90166ba64f8062ba7873c17cd92c7", true),
    file("libllama.0.8.0.dylib", 4002248, "440d825857c0cab0e627a05436fca29992a5a9f33fae6ba9dd7de3ba4998b96b", true),
    file("libmtmd.0.8.0.dylib", 1761808, "b176b1ac098afff4942cff2060ec6de822b08fd73756184f8e7bcb4791bf7277", true),
    file("llama-server", 20760, "3947d5af3bab3e16b7e32e915a831b91e58d95e971b3dd0a3f67f8c0d07d6dfd", true),
  ],
  "linux-x64": [
    file("libggml-base.so.0.28.0", 929000, "4ad7892b5d2d567ad492fc19d3725522dc5161fc0cfedf6d829ec408fde4142a", true),
    file("libggml-cpu-alderlake.so", 1438128, "ccab67ca95af59f7a5f72b7f83b90451957eb62ae4028b4bd2f5f78dd37c4740", true),
    file("libggml-cpu-cannonlake.so", 1583408, "762dd25dfbc288faf091e81cc97461e394de76875a63c6822acfa6244e499cca", true),
    file("libggml-cpu-cascadelake.so", 1599496, "2f98b02e9706475689a629d4e41813a2c1bf08b17f9655ab5a007e062a3c2d82", true),
    file("libggml-cpu-cooperlake.so", 1599568, "57a02f46141a7e42ddc8e5217f26be6c0579bb65661fd895110116c7e060b27b", true),
    file("libggml-cpu-haswell.so", 1438128, "37c755982f13955f7b95c5521f1d1a3fa34f2f27568ba60b97351484007550a5", true),
    file("libggml-cpu-icelake.so", 1599496, "15e9facf9c5731c3d744355bff4227a13bc88e9cd2d2ae44cf002afdc406e13d", true),
    file("libggml-cpu-ivybridge.so", 1373752, "55687beb2005976403bb54f74f458bdc75ebc861a04a282b759f1a55b239ee78", true),
    file("libggml-cpu-piledriver.so", 1369656, "0bd26ddd7e20d727641200aafd6d7cef507812ed9593c3028840fd17da573f80", true),
    file("libggml-cpu-sandybridge.so", 1372800, "3bd522c900b58aa9700d35654a4d8111d8a083cca7eb6ad31115bdbb59a5f48d", true),
    file("libggml-cpu-sapphirerapids.so", 1865872, "7922988ba01aa5e18f7a4e95574c494646cdeb4ac444c0f6f74ca36dc95e9905", true),
    file("libggml-cpu-skylakex.so", 1583408, "4f9a435bf223acc379617fb1619d25195ea3222efde4802b841970a535b0ddb8", true),
    file("libggml-cpu-sse42.so", 980440, "2aaa8782f772b3d3374eedef14dc02049e8f6cec0dbb72cddfa3802fa6038c2b", true),
    file("libggml-cpu-x64.so", 976464, "601c9bfe22723f56f9fb14aaef210ffe27caced7d8359db0dc879f5c1a31a0a8", true),
    file("libggml-cpu-zen4.so", 1599568, "8a34f2f5ab19db4556a785bcd5e6ef64a6f186a48b3f20138c25683b57986b31", true),
    file("libggml-rpc.so", 319896, "39d3e844f1985afd722007641cd28a2161e86981835474ee406278edf6588620", true),
    file("libggml.so.0.28.0", 51040, "8643a58bb37af6fb153e2ea98b48efa227855725ee51c05f4ca76b9867956463", true),
    file("libllama-batched-bench-impl.so", 48904, "5d46f2b7f9c63e6e23c47ee606dcbffb25a851cef9b785f9d35337a2fcf5cc8b", true),
    file("libllama-bench-impl.so", 490560, "f8cc87e84ff172c58389e7786257c87156c160bbc0970b8ac24803a46d708859", true),
    file("libllama-cli-impl.so", 276960, "3edb1ebbbfb38c77bb30c2bfeee3af879ff95961fa28a02742156c6927b9cc71", true),
    file("libllama-common.so.0.8.0", 6758616, "5d7d52a0af5c62e2c9827c8e16b5a8d0602e3888716926652eca6e9520059a65", true),
    file("libllama-completion-impl.so", 144864, "117ad8cb0be526532f545c7c12623b49c4c38d6365188dbdcdb4989ec3fd9173", true),
    file("libllama-fit-params-impl.so", 39760, "60ff3c3a7c6e98eada0a78495a6ee2f06c953e018ac3b3bee22b681ba70511fd", true),
    file("libllama-perplexity-impl.so", 171912, "87ac1151e1e459916de71c8a8f02c7824ed42b67b8be29094ddf83558ae5d6d3", true),
    file("libllama-quantize-impl.so", 81840, "79d821e4e88ebc408f52a1b3d7d13f44aeb6f71bba13574e7d395608b671775a", true),
    file("libllama-server-impl.so", 8281320, "7025b862a45498fcbbdc9846ecb77aae216c5f97ece18069e0b70c2787ac5601", true),
    file("libllama.so.0.8.0", 5361824, "e778b4b1a897f6cb8ff5dd0878723889e4f24d4920be6b1b9377bdc0911da642", true),
    file("libmtmd.so.0.8.0", 2223952, "92af6493d57df9b353bee5721038208167b01922ac45a20b2419453e11dcbafb", true),
    file("llama-server", 17864, "e520f29ca74b4d270bdcd7d185d3855d1b87b90469c9ee47e661b11ca71c167a", true),
  ],
  "win32-x64": [
    file("ggml-base.dll", 827904, "45703aee2f00e637ed51e8fed4e9ed92872992a175be32a23e37459067d504d1"),
    file("ggml-cpu-alderlake.dll", 1442816, "e8d17104af5a3e5a14ba0013375bbb0f098d1eabd60741bfafc7b792dde07867"),
    file("ggml-cpu-cannonlake.dll", 1637888, "d31c0819d902ed2fbd774b747c3d3e2c87d9888e912475fef3785bd82ea14796"),
    file("ggml-cpu-cascadelake.dll", 1611776, "c9c3829bee8cc427f8a687e294920a7d61ee76a575156bd5784e03fc98aa8f37"),
    file("ggml-cpu-cooperlake.dll", 1620992, "369eb400a9bc420b4a5047ee5982376db34a490f3aade2c4a0d1a7005f00513b"),
    file("ggml-cpu-haswell.dll", 1447424, "368786db3da83d51d0196d42cd73fb49e9e1edd2eb1a234e9a9cec4a41933557"),
    file("ggml-cpu-icelake.dll", 1617920, "270a676f38881bf6a6bc7dad7b7a1a5d2fc56d3959a6877b5b4f9f5433223d5c"),
    file("ggml-cpu-ivybridge.dll", 1328640, "5825b564b5773d17d06254dccad1d113c4700a8ddb9186c559432ed6f01c6353"),
    file("ggml-cpu-piledriver.dll", 1321472, "1f7b289ebb89f743418cd8aebdded69fb1c67b308d9b0bf5a4e02b7426e9cc1f"),
    file("ggml-cpu-sandybridge.dll", 1319424, "27fb0135c01e84ff0dc5a938facde843729bf5df42c708f024df6539774ae1e7"),
    file("ggml-cpu-sapphirerapids.dll", 1897472, "c45a4896efdea13faefa7f6fe75e2571b5597e0ae8df49a0047a87f871b4319f"),
    file("ggml-cpu-skylakex.dll", 1631744, "2f28921eb5c71d90028d89308fe21ed6d9a128533d3ca7507974e45f26a099ab"),
    file("ggml-cpu-sse42.dll", 944128, "746fdfb7f44f9400e92e444821c3ea9e2faf82c39e4c5cbbf118a39ad24ab71a"),
    file("ggml-cpu-x64.dll", 935936, "95c98b2a7ba6d94f9d8a2cfdd341e8d501f0ef7b7545e29cf4355bcd0d1b128e"),
    file("ggml-cpu-zen4.dll", 1627648, "fdfbc28be8d0926bf17bae04f359bec1d177687cba4b60052725b1d219512752"),
    file("ggml-rpc.dll", 231424, "05cbbd7e6806a06eddd346aadeded32e73e0d264d81dfa42432a88821a2bc545"),
    file("ggml.dll", 78848, "216ac54f1633abf9d4c690c4002f66bc6fb8def628b7727e4498660ac3543591"),
    file("libomp.dll", 768000, "a12116ba72d1d6820407cf30be23da04ce79d6bb8a71a5ee71759c5a1faa6f1c"),
    file("llama-batched-bench-impl.dll", 61952, "36766acd9df305c5b008e588af513c76047a2aa67b9faef8ec5513a7f4c6aaf1"),
    file("llama-bench-impl.dll", 404480, "bad90d01813cbc2b3044bc0b31233fae506f8365318db1735e0d487657bae916"),
    file("llama-cli-impl.dll", 3375104, "00f6f281009599fc126b17caed66832b8e20f7b8094a8b3e97381163016db32e"),
    file("llama-common.dll", 8346112, "a259f6d6257055f4f18b80b3b8139fe671e3c04110d7b2f2e1f3d155a672172a"),
    file("llama-completion-impl.dll", 138752, "80a281e8f4c5eb701e9e6e91fc61461ea0e750fbf64d41bd3bb323461374f0f9"),
    file("llama-fit-params-impl.dll", 43520, "13c7c40c9a21bdd149c488c389b9084396c14205d175c98c674e35bb7c9ef5f1"),
    file("llama-perplexity-impl.dll", 198144, "7ce2fdd211102e3a3714610d771d6664d786e243f643589241571345042ed26e"),
    file("llama-quantize-impl.dll", 137216, "5b13420ef83a6142a81b9002c260c4d4997b2dec5de6a9bf17be3001831a1488"),
    file("llama-server-impl.dll", 10091520, "98a151f1915cbeda0dfb7ef5ab860e3d672f9b173ec5b575f4b2e7ccf8be2985"),
    file("llama-server.exe", 9728, "fe2957c5fc9defb76279a513ea58153b5990c14af8e2c9d2150c2d194bf72668"),
    file("llama.dll", 3754496, "c58231599579acc8f36593cf1462fa4dfd2eaf7fab393f98cc1e15b570f7f5ee"),
    file("mtmd.dll", 2156032, "73adcc2d33e6f8fca6e92d5c43be989d9c325393b4eb9d463e179fdc72deaa23"),
  ],
};

function unavailable(
  id: string,
  name: string,
  platform: string,
  summary: string,
  version: string,
  documentationUrl: string,
  reason: string,
  bindings: BindingSpec[],
): z.input<typeof EngineCatalogItem> {
  return {
    id,
    name,
    version,
    kind: "archive",
    platform,
    available: false,
    unavailableReason: reason,
    summary,
    documentationUrl,
    bindings,
    files: [],
    source: {
      kind: "archive",
      url: "https://example.invalid/unavailable",
      size: 1,
      sha256: "0".repeat(64),
      format: "tar.gz",
      stripPrefix: "unavailable",
    },
  };
}

function transcribeNative(platform: string): z.input<typeof EngineCatalogItem> {
  const archive = TRANSCRIBE_ARCHIVES[platform],
    files = TRANSCRIBE_FILES[platform],
    library =
      platform.startsWith("darwin") ? "libtranscribe.dylib"
        : platform.startsWith("win32") ? "transcribe.dll" : "libtranscribe.so";
  if (!archive || !files)
    return unavailable(
      "transcribe-native",
      "transcribe.cpp 运行库",
      platform,
      "本地 ASR 与说话人分段的原生运行库",
      TRANSCRIBE_VERSION,
      TRANSCRIBE_DOC,
      `当前平台 ${platform} 没有已核验的 transcribe 预编译产物`,
      [{ setting: "asr_library", target: "file", file: library }],
    );
  return {
    id: "transcribe-native",
    name: "transcribe.cpp 运行库",
    version: TRANSCRIBE_VERSION,
    kind: "archive",
    platform,
    available: true,
    summary: "本地 ASR 与说话人分段的原生运行库",
    documentationUrl: TRANSCRIBE_DOC,
    bindings: [{ setting: "asr_library", target: "file", file: library }],
    files,
    source: { kind: "archive", format: "tar.gz", ...archive },
  };
}

function transcribeBindings(): z.input<typeof EngineCatalogItem> {
  return {
    id: "transcribe-bindings",
    name: "transcribe.cpp Python bindings",
    version: TRANSCRIBE_VERSION,
    kind: "archive",
    platform: "all",
    available: true,
    summary: "transcribe 原生运行库的 Python ctypes 绑定",
    documentationUrl: TRANSCRIBE_DOC,
    bindings: [{ setting: "asr_bindings", target: "directory" }],
    files: BINDINGS_FILES,
    source: {
      kind: "archive",
      url: BINDINGS_WHEEL.url,
      size: BINDINGS_WHEEL.size,
      sha256: BINDINGS_WHEEL.sha256,
      format: "zip",
      stripPrefix: "",
      include: ["transcribe_cpp/"],
    },
  };
}

function tenVad(platform: string): z.input<typeof EngineCatalogItem> {
  const pin = TEN_VAD_FILES[platform];
  const item = {
    id: "ten-vad",
    name: "TEN VAD 原生运行库",
    version: TEN_VAD_REVISION.slice(0, 12),
    kind: "file" as const,
    platform,
    available: true,
    summary: "语音活动检测原生运行库",
    documentationUrl: TEN_VAD_DOC,
  };
  if (!pin)
    return {
      ...unavailable(
        "ten-vad",
        "TEN VAD 原生运行库",
        platform,
        "语音活动检测原生运行库",
        TEN_VAD_REVISION.slice(0, 12),
        TEN_VAD_DOC,
        `当前平台 ${platform} 没有已核验的 TEN VAD 二进制`,
        [{ setting: "vad_library", target: "file", file: "ten_vad" }],
      ),
      kind: "file",
      source: {
        kind: "file",
        url: "https://example.invalid/unavailable",
        size: 1,
        sha256: SHA256.parse("0".repeat(64)),
        executable: false,
      },
    };
  return {
    ...item,
    bindings: [{ setting: "vad_library", target: "file", file: pin.path }],
    files: [file(pin.path, pin.size, pin.sha256, true)],
    source: {
      kind: "file",
      url: pin.url,
      size: pin.size,
      sha256: SHA256.parse(pin.sha256),
      executable: true,
    },
  };
}

function llamaServer(platform: string): z.input<typeof EngineCatalogItem> {
  const archive = LLAMA_ARCHIVES[platform],
    files = LLAMA_FILES[platform],
    binary = archive?.binary || "llama-server";
  if (!archive)
    return unavailable(
      "llama-server",
      "llama-server",
      platform,
      "GGUF 视觉检索、重排与字幕翻译的本地服务",
      LLAMA_SERVER_BUILD,
      LLAMA_DOC,
      `当前平台 ${platform} 没有已核验的 llama-server 预编译产物`,
      [
        { setting: "visual_server", target: "executable", file: binary },
        { setting: "llama_server", target: "executable", file: binary },
        { setting: "translation_server", target: "executable", file: binary },
      ],
    );
  return {
    id: "llama-server",
    name: "llama-server",
    version: LLAMA_SERVER_BUILD,
    kind: "archive",
    platform,
    available: true,
    summary: "GGUF 视觉检索、重排与字幕翻译的本地服务",
    documentationUrl: LLAMA_DOC,
    bindings: [
      { setting: "visual_server", target: "executable", file: binary },
      { setting: "llama_server", target: "executable", file: binary },
      { setting: "translation_server", target: "executable", file: binary },
    ],
    files,
    probe: ["--version"],
    source: {
      kind: "archive",
      url: archive.url,
      size: archive.size,
      sha256: SHA256.parse(archive.sha256),
      format: platform.startsWith("win32") ? "zip" : "tar.gz",
      stripPrefix: archive.stripPrefix,
    },
  };
}

function pythonEnvironment(
  id: "python-model" | "python-speech",
  name: string,
  setting: "model_python" | "speech_python",
  requirements: string,
  summary: string,
): z.input<typeof EngineCatalogItem> {
  const platform = currentPlatform();
  const version = requirementsVersion(requirements);
  const python = platform.startsWith("win32")
    ? "Scripts/python.exe"
    : "bin/python";
  const base = {
    id,
    name,
    version: version || "missing",
    kind: "python-env" as const,
    platform,
    summary,
    bindings: [{ setting, target: "executable" as const, file: python }],
    files: [],
  };
  if (!version)
    return {
      ...base,
      available: false,
      unavailableReason: `安装资源缺少 ${requirements}`,
      source: { kind: "python-env", requirements },
    };
  return {
    ...base,
    available: true,
    source: { kind: "python-env", requirements },
  };
}

export function requirementsPath(requirements: string): string {
  return path.join(currentRuntime().resourcesDir, "weaver", requirements);
}

function requirementsVersion(requirements: string): string {
  try {
    return createHash("sha256")
      .update(fs.readFileSync(requirementsPath(requirements)))
      .digest("hex")
      .slice(0, 12);
  } catch {
    return "";
  }
}

export function engineCatalog(): z.infer<typeof EngineCatalog> {
  const platform = currentPlatform();
  return EngineCatalog.parse({
    schemaVersion: 1,
    items: [
      transcribeNative(platform),
      transcribeBindings(),
      tenVad(platform),
      llamaServer(platform),
      pythonEnvironment(
        "python-model",
        "模型 Python 环境",
        "model_python",
        "requirements.models.txt",
        "强制对齐与视觉检索使用的独立 Python 环境",
      ),
      pythonEnvironment(
        "python-speech",
        "语音 Python 环境",
        "speech_python",
        "requirements.speech.txt",
        "本地语音合成使用的独立 Python 环境",
      ),
    ],
  });
}

export function installDirectory(root: string, id: string): string {
  return path.join(root, id);
}

export function engineBindingValue(
  directory: string,
  binding: BindingSpec,
): string {
  return binding.target === "directory"
    ? directory
    : path.join(directory, binding.file);
}
