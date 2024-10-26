---
id: quick-start
title: Quick Start
---

GTFS-to-HTML is a flexible tool that converts GTFS transit data into human-readable HTML timetables. This guide covers multiple ways to use the tool, from a simple web interface to advanced programmatic usage.

## Installation Options

### 1. Hosted Web Version (No Installation Required)

For users who prefer a no-setup solution, visit our hosted version at [run.gtfstohtml.com](https://run.gtfstohtml.com). This option:

- Runs entirely in your browser
- Supports HTML, CSV, and PDF output formats
- Allows customization via a user-friendly interface

Currently, the hosted web version is limited to relatively small GTFS files and doesn't offer support for [Custom Templates](/docs/custom-templates).

### 2. Command Line Installation

For developers and users comfortable with the command line, install globally via npm:

```bash
npm install gtfs-to-html -g
```

Basic usage:
```bash
gtfs-to-html
```

#### Command Line Options

| Option | Description |
|--------|-------------|
| `--configPath` | Specify a custom configuration file path |
| `--skipImport` | Skip GTFS import (useful for repeated runs where the GTFS doesn't change) |

Example usage:
```bash
gtfs-to-html --configPath ./custom-config.json --skipImport
```

#### Extremely Large GTFS Files

For processing large GTFS files, increase Node.js memory limit:
```bash
NODE_OPTIONS=--max_old_space_size=4096 gtfs-to-html
```

### 3. Programmatic Usage as a node module

For integration into Node.js applications:

```javascript
import gtfsToHtml from 'gtfs-to-html';
import { readFile } from 'fs/promises';

const config = JSON.parse(
  await readFile(new URL('./config.json', import.meta.url))
);

try {
  await gtfsToHtml(config);
  console.log('Timetables generated successfully');
} catch (err) {
  console.error('Generation failed:', err);
}
```

### 4. Docker Installation

We provide Docker support for containerized environments in the `docker` directory.

#### Using Dockerfile

1. Create your `config.json` (use `config-sample.json` as a template)
2. Remove  `sqlitePath` and `templatePath` values from your config.json.
3. Build and run:
```bash
docker build -t gtfs-to-html .
docker run gtfs-to-html
```

4. Extract generated files:
```bash
# Get container ID
docker container ls -a

# Copy files (replace with your container ID)
docker cp <container-id>:/html .
```

#### Using Docker Compose

For easier volume management and configuration:

1. Prepare your `config.json` and save in the same directory as your `Dockerfile` and `docker-compose.yml`
2. Run:
```bash
docker-compose up
```

Generated files will appear in the folder `html` next to docker files.

## Development Server

For local development and testing, we provide an Express.js application:

```bash
# Start the development server
node ./dist/app

# With custom config
node ./dist/app --configPath ./custom-config.json
```

Access the development server at [localhost:3000](http://localhost:3000).

## Next Steps

- [Configuration Options](/docs/configuration) - Customize your timetable output
- [Custom Templates](/docs/custom-templates) - Create custom HTML templates to completely control how timetables are laid out and styled
- [Additional GTFS Files](/docs/additional-files) - Control timetable generation by adding additional .txt files to your GTFS
- [Related Libraries](/docs/related-libraries) - Other libraries for processing and using GTFS and GTFS-Realtime
- [Current Usage](/docs/current-usage) - List of transit agencies that use GTFS-to-HTML
