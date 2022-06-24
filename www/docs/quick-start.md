---
id: quick-start
title: Quick Start
---

## Command Line Usage

The `gtfs-to-html` command-line utility will download the GTFS file specified in `config.js` and then build the HTML timetables and save them in `html/:agency_key`.

If you would like to use this library as a command-line utility, you can install it globally directly from [npm](https://npmjs.org):

    npm install gtfs-to-html -g

Then you can run `gtfs-to-html`.

    gtfs-to-html

### Command-line options

`configPath`

Allows specifying a path to a configuration json file. By default, `gtfs-to-html` will look for a `config.json` file in the directory it is being run from.

    gtfs-to-html --configPath /path/to/your/custom-config.json

`skipImport`

Skips importing GTFS into SQLite. Useful if you are rerunning with an unchanged GTFS file. If you use this option and the GTFS file hasn't been imported, you'll get an error.

    gtfs-to-html --skipImport

### Processing very large GTFS files.

By default, node has a memory limit of 512 MB or 1 GB. If you have a very large GTFS file and want to use the option `showOnlyTimepoint` = `false` you may need to allocate more memory. Use the `max-old-space-size` option. For example to allocate 4 GB:

    NODE_OPTIONS=--max_old_space_size=4096 gtfs-to-html

## Docker Usage

You can use both [`docker`](https://docker.com) and [`docker-compose`](https://docs.docker.com/compose/) to run GTFS-to-HTML.

### Dockerfile

A `Dockerfile` is available in the `docker` directory.

- Create a `config.json` file and save in the same directory as your `Dockerfile`. You can use `config-sample.json` from the project root as a starting point. For Docker usage, remove any `sqlitePath` and `templatePath` values from the config.json.

- Build the docker image:

        docker build -t gtfs-to-html .

- Run the docker image:

        docker run gtfs-to-html

- Copy the generated HTML out of the docker container

        // Figure out what your container ID is
        docker container ls -a

        // Then copy the html folder from that container
        docker cp <YOUR IMAGE CONTAINER ID>:/html .

        // For example:
        docker cp ca45a38963d9:/html .

### Docker Compose

Docker compose is used for multi-container Docker applications. In this context, it is just a convenient way to manage volumes. This allows (_i_) to get the generated HTML out of the docker container without explicitly copying with `docker cp`, and (_ii_) to tweak and run a new configuration without rebuilding the container from scratch.

- Create a `config.json` file and save in the same directory as your `Dockerfile` and `docker-compose.yml`;

- build and run the container:

        docker-compose up

- the generated HTML will be available in the folder `html` next to docker files.

Do you want to change something? Just delete the old HTML, change your `config.json`, and finally run `docker-compose up` again.

## Usage as a node module

If you are using this as a node module as part of an application, you can include it in your project's `package.json` file.

### Code example

```javascript
import gtfsToHtml from 'gtfs-to-html';
import { readFile } from 'fs/promises';
const config = JSON.parse(
  await readFile(new URL('./config.json', import.meta.url))
);

gtfsToHtml(config)
  .then(() => {
    console.log('HTML Generation Successful');
    process.exit();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

### Example Application

An example Express application that uses `gtfs-to-html` is included in the `app` folder. After an initial run of `gtfs-to-html`, the GTFS data will be downloaded and loaded into SQLite.

You can view an individual route HTML on demand by running the included Express app:

    node app

By default, `gtfs-to-html` will look for a `config.json` file in the project root. To specify a different path for the configuration file:

    node app --configPath /path/to/your/custom-config.json

Once running, you can view the HTML in your browser at [localhost:3000](http://localhost:3000)

## Usage as a hosted web app

A [hosted version of GTFS-to-HTML as a service](https://run.gtfstohtml.com) allows you to use it entirely within your browser - no downloads or command line necessary.

It provides:

- a web-based interface for finding GTFS feeds or ability to enter your own URL
- support for adding [custom configuration](/docs/configuration) as JSON
- creation of HTML timetables as a downloadable .zip file
- a preview of all timetables generated directly in your browser

[run.gtfstohtml.com](https://run.gtfstohtml.com)

Currently, it is limited to relatively small GTFS files and doesn't offer support for [Custom Templates](/docs/custom-templates).

## Troubleshooting

### SQLite3 unable to be installed with `Failed to exec install script`

For an error like:
`lifecycle sqlite3@5.0.0~install: Failed to exec install script`

Try installing `gtfs-to-html` using the following flags:

`npm install --unsafe-perm --allow-root -g`
