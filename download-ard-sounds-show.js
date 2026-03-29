import { parseArgs } from "util";
import { ArdSoundsDownloader } from "./ard-sounds-downloader";
import { $ } from "bun";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
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
      default: "240",
    },
    targetFolder: {
      type: "string",
      default:
        "~/ard_sounds_downloads/{programSet.publicationService.title} - {programSet.title}/{title}",
    },
    filename: {
      type: "string",
      default: "{title}.{file_extension}",
    },
  },
  strict: true,
  allowPositionals: true,
});

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
