<p align="center">
  ➡️
  <a href="https://gtfstohtml.com/docs/">Documentation</a> |
  <a href="https://gtfstohtml.com/docs/quick-start">Quick Start</a> |
  <a href="https://gtfstohtml.com/docs/configuration">Configuration</a> |
  <a href="https://gtfstohtml.com/docs/contact">Questions and Support</a>
  ⬅️
  <br /><br />
  <img src="www/static/img/gtfs-to-html-logo.svg" alt="GTFS-to-HTML" />
  <br /><br />
  <a href="https://www.npmjs.com/package/gtfs-to-html" rel="nofollow"><img src="https://img.shields.io/npm/v/gtfs-to-html.svg?style=flat" style="max-width: 100%;"></a>
  <a href="https://www.npmjs.com/package/gtfs-to-html" rel="nofollow"><img src="https://img.shields.io/npm/dm/gtfs-to-html.svg?style=flat" style="max-width: 100%;"></a>
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg">
  <br /><br />
  Create human-readable, user-friendly transit timetables in HTML, PDF or CSV format directly from GTFS.
  <br /><br />
  <a href="https://nodei.co/npm/gtfs-to-html/" rel="nofollow"><img src="https://nodei.co/npm/gtfs-to-html.png?downloads=true" alt="NPM" style="max-width: 100%;"></a>
</p>

<hr>

See [gtfstohtml.com](https://gtfstohtml.com) for full documentation.

Most transit agencies have schedule data in [GTFS ](https://developers.google.com/transit/gtfs/) format but need to show each route's schedule to users on a website. GTFS-to-HTML automates the process of creating nicely formatted HTML timetables for inclusion on a transit agency website. This makes it easy to keep timetables up to date and accurate when schedule changes happen and reduces the likelihood of errors.

<img width="1265" src="https://user-images.githubusercontent.com/96217/28296063-aed45568-6b1a-11e7-9794-94b3d915d668.png">

## Features

### Configurable and customizable

`gtfs-to-html` has many options that configure how timetables are presented. It also allows using a completely custom template which makes it easy to build chunks of HTML that will fit perfectly into any website using any HTML structure and classes that you'd like. Or, create printable PDF versions or CSV exports of timetables using the `outputFormat` config option.

### Accessibility for all

`gtfs-to-html` properly formats timetables to ensure they are screen-reader accessible and WCAG 2.0 compliant.

### Mobile responsiveness built in

Built-in styling makes `gtfs-to-html` timetables ready to size and scroll easily on mobile phones and tablets.

### Schedule changes? A cinch.

By generating future timetables and including dates in table metadata, your timetables can appear in advance of a schedule change, and you can validate that your new timetables and GTFS are correct.

### Auto-generated maps

`gtfs-to-html` can also generate a map for each route that can be included with the schedule page. The map shows all stops for the route and lists all routes that serve each stop. Maps can also show realtime vehicle locations and predicted arrival times from GTFS-realtime data.

Note: If you only want maps of GTFS data, use the [gtfs-to-geojson](https://github.com/blinktaginc/gtfs-to-geojson) package instead and skip making timetables entirely. If offers many different formats of GeoJSON for routes and stops.

`gtfs-to-html` uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data.

## GTFS-to-HTML on the web

You can now use `gtfs-to-html` without actually downloading any code or doing any configuration. [run.gtfstohtml.com](https://run.gtfstohtml.com) provides a web based interface for finding GTFS feeds for agencies, setting configuration and then generates a previewable and downloadable set of timetables.

## Current Usage

Many transit agencies use `gtfs-to-html` to generate the schedule pages used on their websites, including:

| Agency                                                                        | Location                            |
| ----------------------------------------------------------------------------- | ----------------------------------- |
| [Basin Transit](https://basin-transit.com)                                    | Morongo Basin, California           |
| [Brockton Area Transit Authority](https://ridebat.com)                        | Brockton, Massachusetts             |
| [Cape Ann Transportation Authority](https://canntran.com)                     | Gloucester, Massachusetts           |
| [Capital Transit](https://juneaucapitaltransit.org)                           | Juneau, Alaska                      |
| [Central Transit](https://centraltransit.org)                                 | Ellensburg, Washington              |
| [Citibus](https://citibus.com)                                                | Lubbock, Texas                      |
| [Commute.org](https://commute.org)                                            | San Mateo County, California        |
| [County Connection](https://countyconnection.com)                             | Contra Costa County, California     |
| [El Dorado Transit](https://eldoradotransit.com)                              | El Dorado County, California        |
| [Greater Attleboro-Taunton Regional Transit Authority](https://www.gatra.org) | Attleboro-Taunton, Massachusetts    |
| [Humboldt Transit Authority](https://hta.org)                                 | Humboldt County, California         |
| [Jefferson Parish Transit](https://jptransit.org)                             | Jefferson Parish, Louisiana         |
| [Kings Area Rural Transit (KART)](https://www.kartbus.org)                    | Kings County, California            |
| [Lowell Regional Transit Authority](https://lrta.com)                         | Lowell, Massachusetts               |
| [Madera County Connection](https://mcctransit.com)                            | Madera County, California           |
| [Marin Transit](https://marintransit.org)                                     | Marin County, California            |
| [Morongo Basin Transit Authority](https://mbtabus.com)                        | Morongo Basin, California           |
| [Mountain Transit](https://mountaintransit.org)                               | Big Bear Valley, California         |
| [Mountain View Community Shuttle](https://mvcommunityshuttle.com)             | Mountain View, California           |
| [MVgo](https://mvgo.org)                                                      | Mountain View, California           |
| [Petaluma Transit](https://transit.cityofpetaluma.net)                        | Petaluma, California                |
| [rabbittransit](https://www.rabbittransit.org)                                | York and Adams County, Pennsylvania |
| [River Valley Transit](https://rivervalleytransit.com)                        | Middletown, Connecticut |
| [Rogue Valley Transportation District](https://rvtd.org)                      | Medford, Oregon                     |
| [RTC Washoe](https://www.rtcwashoe.com)                                       | Reno, Nevada                        |
| [Santa Barbara Metropolitan Transit District](https://sbmtd.gov)              | Santa Barbara, California           |
| [Sonoma County Transit](https://sctransit.com)                                | Sonoma County, California           |
| [South Central Transit](https://southcentraltransit.org)                      | South Central Illinois              |
| [STAR Transit](https://www.startransit.org)                                   | Balch Springs, Texas                |
| [Sunline Transit Agency](https://www.sunline.org)                             | Riverside County, California        |
| [Tahoe Transportation District](https://www.tahoetransportation.org)          | Lake Tahoe, California              |
| [Tahoe Truckee Area Regional Transit](https://tahoetruckeetransit.com)        | Truckee, California                 |
| [Transcollines](https://transcollines.ca)                                     | Les Collines-de-l'Outaouais, Quebec |
| [Tulare County Area Transit](https://ridetcat.org)                            | Tulare County, California           |
| [Victor Valley Transit](https://vvta.org)                                     | Victory Valley, California          |
| [Worcester Regional Transit Authority](https://therta.com)                    | Worcester, Massachusetts            |

Are you using `gtfs-to-html`? Let us know via email [gtfs@blinktag.com](mailto:gtfs@blinktag.com) or via opening a github issue or pull request if your agency is using this library.

`gtfs-to-html` is used as an integral part of [`transit-custom-posts`](https://trilliumtransit.github.io/transit-custom-posts/) - a GTFS-optimized Wordpress plugin for transit websites.

<img width="1265" src="https://user-images.githubusercontent.com/96217/28296063-aed45568-6b1a-11e7-9794-94b3d915d668.png">

<img width="1265" src="https://user-images.githubusercontent.com/96217/29205138-dd3ee5c6-7e2f-11e7-9d86-f17cebd5f118.png">

## Installation, Configuration and Usage documentation

[See GTFS-to-HTML Documentation](https://gtfstohtml.com)

## Changelog

[See Changelog](https://github.com/blinktaginc/gtfs-to-html/blob/master/CHANGELOG.md)

## Contributing

Pull requests are welcome, as well as [feedback and reporting issues](https://github.com/blinktaginc/gtfs-to-html/issues).

## Tests

    npm test
