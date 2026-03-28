import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { request } from "graphql-request";
import * as schemas from "./schemas";
import sanitize from "sanitize-filename";
import { stderr, stdout } from "node:process";
import NodeID3 from "node-id3";
import mime from "mime";

export class ArdSoundsDownloader {
  #storeJSONData = true;
  #overwriteExistingAudioFiles = false; /* currently only working for mp3 file(s) */

  #sanitizeFilename(filename) {
    return sanitize(filename.replace(/(\d+)\/(\d+)/g, "$1 von $2"));
  }

  async #downloadFile(url, filename, allowedMimeTypeRegex) {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    let urlFilename = new URL(url).pathname.split(".").at(-1);
    let fileExtension =
      urlFilename.length <= 4 ? urlFilename : contentType.split("/").at(-1);

    if (!allowedMimeTypeRegex.test(contentType)) {
      return null;
    }

    if (fileExtension === "mpeg" || contentType.match(/octet-stream/)) {
      fileExtension = "mp3";
    }

    const fileBuffer = await response.arrayBuffer();
    const outputFilename = filename.replace("{file_extension}", fileExtension);
    await Bun.write(outputFilename, new Uint8Array(fileBuffer));
    return outputFilename;
  }

  #parseShowId(id) {
    const showID = id
      .split("/")
      .find((v) => /^urn:ard:show:[a-f0-9]+$/.test(v));

    if (!showID) {
      throw new Error(
        "Invalid id, must contain a show url / id like `urn:ard:show:570e67b2b6bd7284`",
      );
    }
    return showID;
  }

  #replacePlaceholders(str, node) {
    return str
      .replace("~", homedir())
      .replace(
        "{programSet.publicationService.title}",
        this.#sanitizeFilename(
          node.programSet?.publicationService?.title || "",
        ),
      )
      .replace(
        "{programSet.title}",
        this.#sanitizeFilename(node.programSet?.title || ""),
      )
      .replace("{title}", this.#sanitizeFilename(node.title || ""));
  }

  async #processAudio(audio, node, audioFilename, coverFile, index) {
    if (!audio.allowDownload) return;

    let numberedFilename = `${audioFilename.replace(
      "{title}",
      this.#sanitizeFilename(
        (node.title || "") + (index > 1 ? ` alternate-format-${index}` : ""),
      ),
    )}`;

    numberedFilename = this.#replacePlaceholders(numberedFilename, node);

    if (!this.#overwriteExistingAudioFiles) {
      if (await Bun.file(numberedFilename + ".mp3").exists()) {
        stdout.write("s");
        return;
      }
    }

    let audioFile = await this.#downloadFile(
      audio.downloadUrl,
      numberedFilename,
      /^(audio|video)\//i,
    );

    if (!audioFile) {
      console.error("m");
      return;
    }

    console.debug(audioFile);

    if (audioFile.match(/\.mp3$/i)) {
      const success = NodeID3.write(
        {
          title: node.title,
          publisher: node.summary,
          artist: (
            node.programSet?.publicationService?.organizationName +
            " " +
            node.programSet?.publicationService?.genre
          ).trim(),
          album: node.programSet?.title,
          recordingTime: node.publishDate ? node.publishDate.split("-")[0] : "",
          image: coverFile
            ? {
                mime: mime.getType(coverFile),
                type: { id: 3, name: "cover" },
                imageBuffer: Buffer.from(
                  await Bun.file(coverFile).arrayBuffer(),
                ),
              }
            : undefined,
        },
        audioFile,
      );
      if (!success) {
        console.error("t");
      }
    }
  }

  async #processNode(
    node,
    { outputTemplate, filenameTemplate, destinationFolder },
  ) {
    if (!node.audios) return destinationFolder;

    const folder = this.#replacePlaceholders(outputTemplate, node);
    if (destinationFolder !== folder) {
      destinationFolder = folder;
      await mkdir(destinationFolder, { recursive: true });
    }

    const coverUrl = node.image?.url?.replace(/\?.+$/, "");
    const coverFile = await this.#downloadFile(
      coverUrl,
      `${destinationFolder}/.${this.#sanitizeFilename(
        node.title +
          (node.programSet?.publicationService?.organizationName || "") ||
          "cover",
      )}.{file_extension}`,
      /^image\//i,
    );

    const filenameOfEpisode =
      `${destinationFolder}/` +
      this.#replacePlaceholders(filenameTemplate, node);

    if (this.#storeJSONData) {
      await Bun.write(
        filenameOfEpisode.replace("{file_extension}", "json"),
        JSON.stringify(node, null, 2),
      );
    }

    let i = 1;
    for (const audio of node.audios) {
      const audioFilename =
        `${destinationFolder}/` +
        filenameTemplate.replace("{title}", "{title}"); // keep placeholder for #processAudio
      try {
        await this.#processAudio(audio, node, audioFilename, coverFile, i);
        i++;
      } catch (e) {
        console.error(e.message);
      }
    }

    if (coverFile) {
      await Bun.file(coverFile).delete();
    }

    return destinationFolder;
  }

  async downloadShow(
    id,
    {
      targetFolder = "~/ard_sounds_downloads/{programSet.publicationService.title} - {programSet.title}/{title}",
      filename = "{title}.{file_extension}",
      limit = 240,
      offset = 0,
      count = 24,
    } = {},
  ) {
    const showID = this.#parseShowId(id);
    const document = schemas.audioPodcast;

    let stopDownload = false;
    let page = 0;
    let destinationFolder = null;

    while (!stopDownload) {
      const variables = {
        id: showID,
        offset: (offset + page) * count,
        count,
      };

      const { result } = await request(
        "https://api.ardaudiothek.de/graphql",
        document,
        variables,
      );

      for (const node of result.items.nodes) {
        destinationFolder = await this.#processNode(node, {
          outputTemplate: targetFolder,
          filenameTemplate: filename,
          destinationFolder,
        });
      }

      page++;

      if (!result?.items?.pageInfo?.hasNextPage || page * count >= limit) {
        stopDownload = true;
      }
    }
  }
}
