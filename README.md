# Unofficial ARD Sounds Batch Downloader

<img src="https://www.ardsounds.de/ard-sounds-sharing-1200x1200.png" width="400" alt="logo">

## Requirements

- [bun](https://bun.sh/)
- posix/linux/macos (windows not supported, should be working via WSL)
- optional: [ffmpeg](https://ffmpeg.org/download.html) (for adding metadata to mp4 and downloading audio-streams)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/pstaender/ard-sounds-downloader.git
```

2. Navigate to the project directory and install dependencies:

```bash
cd ard-sounds-downloader
bun install
```

## Usage

Download with the following command:

```bash
bun run download-ard-sounds-show.js --id urn:ard:show:bbb7635a8c2dd75e
```

You can also use the complete url having the show id included:

```bash
bun run download-ard-sounds-show.js --id https://www.ardsounds.de/sendung/sherlock-holmes-krimi-hoerspielklassiker-nach-sir-arthur-conan-doyle/urn:ard:show:bbb7635a8c2dd75e/
```

### Options

`--targetFolder`, default is `~/ard_sounds_downloads/{programSet.publicationService.title} - {programSet.title}/{title}`.

`--filename`, default is `{title}.{file_extension}`

```bash
bun run download-ard-sounds-show.js --id urn:ard:show:bbb7635a8c2dd75e --targetFolder "~/audiothek/{programSet.title}" --filename "{programSet.title} - {title}.{file_extension}"
```

### Batch download of many shows

```bash
for id in urn:ard:show:5012a809f8b1971e urn:ard:show:cf53134d704651ea …; do
  bun run download-ard-sounds-show.js --id $id;
done
```

<img width="738" height="226" alt="Screenshot 2026-03-29 at 12 17 45" src="https://github.com/user-attachments/assets/d6cef0ed-89b2-4d7c-8892-5b8f27076559" />
<img width="1158" height="712" alt="Screenshot 2026-03-29 at 12 42 13" src="https://github.com/user-attachments/assets/362361cb-dfa0-439c-8a46-e2fb627525df" />


## Disclaimer

This is **not** an official ARD Sounds software. It is not affiliated with ARD or any of its subsidiaries. Use for educational purposes only. Use at your own risk.

## License

This project is licensed under the MIT License.
