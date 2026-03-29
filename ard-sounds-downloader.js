import { mkdir, exists } from "node:fs/promises";
import { homedir } from "node:os";
import { request } from "graphql-request";
import * as schemas from "./schemas";
import sanitize from "sanitize-filename";
import { Glob } from "bun";
import { JSDOM } from "jsdom";
import { $ } from "bun";
import NodeID3 from "node-id3";
import mime from "mime";

export class ArdSoundsDownloader {
  #storeJSONData = true;
  #overwriteExistingFolders = false;
  #useFFMpeg = false;

  #sanitizeFilename(filename) {
    return sanitize(filename.replace(/(\d+)\/(\d+)/g, "$1 von $2"));
  }

  enableFFMpeg() {
    this.#useFFMpeg = true;
  }

  async #downloadFile(url, filename, allowedMimeTypeRegex) {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    let urlFilename = new URL(url).pathname.split(".").at(-1);
    let fileExtension =
      urlFilename.length <= 4 ? urlFilename : contentType.split("/").at(-1);

    if (this.#useFFMpeg && fileExtension === "m3u8") {
      // download stream
      fileExtension = "mp4";
      const outputFilename = filename.replace(
        "{file_extension}",
        fileExtension,
      );
      await $`ffmpeg -i ${url} -c copy ${outputFilename}`;
      return outputFilename;
    } else if (
      fileExtension === "mpeg" ||
      (/(octet-stream|x-mpegURL)/.test(contentType) &&
        urlFilename.match(/(mp3|mp4)$/i))
    ) {
      // download octet-stream also as mp3 or mp4, depending on url
      fileExtension = urlFilename;
    } else if (!allowedMimeTypeRegex.test(contentType)) {
      console.error(`${urlFilename} mimetype ${contentType} not allowed`);
      return null;
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
    // if (!audio.allowDownload) return;

    if (index > 1 && /\.mp3$/i.test(audio.downloadUrl || audio.url)) {
      // mp3 is no alternate format
      return;
    }

    let numberedFilename = `${audioFilename.replace(
      "{title}",
      this.#sanitizeFilename(
        (node.title || "") + (index > 1 ? ` alternate-format-${index}` : ""),
      ),
    )}`;

    numberedFilename = this.#replacePlaceholders(numberedFilename, node);

    let audioFile = await this.#downloadFile(
      audio.downloadUrl || audio.url,
      numberedFilename,
      /^(audio|video)\//i,
    );

    if (!audioFile) {
      console.error("No audio file found.");
      return;
    }

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
        console.error("id3tag problem.");
        return null;
      }
    }
    return audioFile;
  }

  async #processNode(
    node,
    { outputTemplate, filenameTemplate, destinationFolder },
  ) {
    if (!node.audios) {
      console.warn(`No audios found, continuing with next episode`);
      return;
    }

    await mkdir(destinationFolder, { recursive: true });

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
      const audioFilename = `${destinationFolder}/` + filenameTemplate; // keep placeholder for #processAudio
      try {
        let finalAudioFile = await this.#processAudio(
          audio,
          node,
          audioFilename,
          coverFile,
          i,
        );
        if (!finalAudioFile) {
          continue;
        }
        console.log(`-> ${finalAudioFile}`);
        i++;
      } catch (e) {
        console.error(e.message);
      }
    }

    // process additional metadata for mp4 files
    try {
      await this.#processAdditionalMetaDataForMp4(
        node,
        filenameOfEpisode.replace(/\/[^\/]+?\.{file_extension}/, "/"),
        coverFile,
        filenameOfEpisode.replace("{file_extension}", "txt"),
      );
    } catch (e) {
      console.error(e);
    }

    if (coverFile) {
      await Bun.file(coverFile).delete();
    }

    return destinationFolder;
  }

  async #processAdditionalMetaDataForMp4(node, folder, coverFile, txtFile) {
    const glob = new Glob(`${folder}/*.{mp4}`);

    let mp4Files = [];
    for await (const file of glob.scan(".")) {
      mp4Files.push(file);
    }

    const episodeUrl = `https://www.ardsounds.de${node.path}`;

    let html = await (await fetch(episodeUrl)).text();

    const dom = new JSDOM(html);

    const title = dom.window.document.querySelector("section h1").textContent;

    const description = dom.window.document.querySelector(
      "section:nth-of-type(1) p",
    ).textContent;

    const summary = dom.window.document.querySelector(
      "section:nth-of-type(1) h1 + *",
    )?.textContent;

    const md = `# ${title}\n\n${[summary, description].filter((v) => !!v).join("\n\n")}`;
    console.debug(`-> ${txtFile}`);
    Bun.file(txtFile).write(md);

    if (!this.#useFFMpeg) {
      return;
    }

    for (const mp4File of mp4Files) {
      const copy1 = mp4File.replace(/\.mp4/, "_tmp1.mp4");
      const copy2 = mp4File.replace(/\.mp4/, "_tmp2.mp4");

      console.debug(
        `ffmpeg -y -i ${mp4File} -i ${coverFile} -map 1 -map 0 -c copy -disposition:0 attached_pic ${copy1}`,
      );

      await $`ffmpeg -y -i ${mp4File} -i ${coverFile} -map 1 -map 0 -c copy -disposition:0 attached_pic ${copy1}`;
      await $`ffmpeg -y -i ${copy1} -metadata title=${node.title || title} -metadata artist=${[
        node.programSet?.publicationService?.title,
        node.programSet?.publicationService?.genre,
      ]
        .filter((v) => !!v)
        .join(
          " ",
        )} -metadata album=${node.programSet?.title} -metadata comment=${[summary, description].filter((v) => !!v).join("\n\n")} -metadata genre=${node.programSet?.publicationService?.genre} -codec copy ${copy2}`;

      if (await Bun.file(copy2).exists()) {
        await $`mv ${copy2} ${mp4File}`;
        console.debug(`=> ${mp4File}`);
      } else if (await Bun.file(copy1).exists()) {
        await $`mv ${copy1} ${mp4File}`;
        console.debug(`=> ${mp4File}`);
      }
      if (await Bun.file(copy1).exists()) {
        await Bun.file(copy1).delete();
      }
    }
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
        let outputTemplate = targetFolder;
        let destinationFolder = this.#replacePlaceholders(outputTemplate, node);

        if (!this.#overwriteExistingFolders) {
          let downloadFolder = this.#replacePlaceholders(
            `${destinationFolder}/` + filename,
            node,
          )
            .split("/")
            .filter((v) => !v.includes(".{file_extension}"))
            .join("/");
          if (await exists(downloadFolder)) {
            console.debug(`skipping existing folder '${downloadFolder}'`);
            continue;
          }
        }

        await this.#processNode(node, {
          outputTemplate,
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
