import { parseArgs } from "util";
import { ArdSoundsDownloader } from "./ard-sounds-downloader";
import { $ } from "bun";

const argOptions = {
  id: {
    type: "string",
  },
  count: {
    type: "string",
    default: "24",
  },
  offset: {
    type: "string",
    default: "0",
  },
  limit: {
    type: "string",
    default: "1000",
  },
  targetFolder: {
    type: "string",
    default:
      "~/ard_sounds_downloads/{programSet.publicationService.title} - {programSet.title}/{title}",
  },
  help: {
    type: "boolean",
    short: "h",
  },
  filename: {
    type: "string",
    default: "{title}.{file_extension}",
  },
};

const { values } = parseArgs({
  args: Bun.argv,
  options: argOptions,
  strict: true,
  allowPositionals: true,
});

if (values.help) {
  console.log(`
Usage: bun run download-ard-sounds-show.js [options]

Options:
  --id                The ID of the show to download (required), e.g. urn:ard:show:1b3dd6076b453726
  --count             The number of episodes to download (default: ${argOptions.count.default})
  --offset            The offset for pagination (default: ${argOptions.offset.default})
  --limit             The maximum number of episodes to download (default: ${argOptions.limit.default})
  --targetFolder      The target folder for downloads (default: "${argOptions.targetFolder.default}")
  --filename          The filename template for downloads (default: "${argOptions.filename.default}")
  -h, --help          Show this help message
`);
  process.exit(0);
}

const downloader = new ArdSoundsDownloader();

try {
  if (await $`which ffmpeg`.quiet()) {
    downloader.enableFFMpeg();
  }
} catch (_) {}

downloader.downloadShow(values.id, {
  targetFolder: values.targetFolder,
  filename: values.filename,
  limit: parseInt(values.limit),
  offset: parseInt(values.offset),
  count: parseInt(values.count),
});
