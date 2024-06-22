---
id: related-libraries
title: Related Libraries
---

## `node-gtfs`
[`https://github.com/blinktaginc/node-gtfs`](https://github.com/blinktaginc/node-gtfs)
<div style={{ display: 'flex', gap: 20 }}>
  <div style={{ width: 100, flexShrink: 0 }}><img src="https://github.com/BlinkTagInc/node-gtfs/raw/master/docs/images/node-gtfs-logo.svg" alt="node-gtfs" width="100" /></div>
  <div><code>gtfs-to-html</code> uses the <a href="https://github.com/blinktaginc/node-gtfs">node-gtfs</a> library to handle importing and querying GTFS data. It provides methods for loading transit data in GTFS format into a SQLite database and methods to query for agencies, routes, stops, times, fares, calendars and other GTFS data. It also offers spatial queries to find nearby stops, routes and agencies and can convert stops and shapes to geoJSON format.</div>
</div>

## `gtfs-to-geojson`
[`https://github.com/blinktaginc/gtfs-to-geojson`](https://github.com/blinktaginc/gtfs-to-geojson)
<div style={{ display: 'flex', gap: 20 }}>
  <div style={{ width: 100, flexShrink: 0 }}><img src="https://github.com/BlinkTagInc/gtfs-to-geojson/raw/master/docs/images/gtfs-to-geojson-logo.svg" alt="gtfs-to-geojson" width="100" /></div>
  <div><a href="https://github.com/blinktaginc/gtfs-to-geojson"><code>gtfs-to-geojson</code></a> converts transit data in GTFS format into geoJSON. This includes both shapes and stops. It can be configured to generate one geoJSON file per route or a single file which contains all routes for an agency. This is useful for creating maps of transit routes.</div>
</div>

## `gtfs-to-chart`
[`https://github.com/blinktaginc/gtfs-to-chart`](https://github.com/blinktaginc/gtfs-to-chart)
<div style={{ display: 'flex', gap: 20 }}>
  <div style={{ width: 100, flexShrink: 0 }}><img src="https://github.com/BlinkTagInc/gtfs-to-chart/raw/master/docs/images/gtfs-to-chart-logo.svg" alt="gtfs-to-chart" width="100" /></div>
  <div><a href="https://github.com/blinktaginc/gtfs-to-chart"><code>gtfs-to-chart</code></a> generates a stringline chart in D3 using data from an agency's GTFS. This chart shows all trips for a specific route as they travel through space over a single day.</div>
</div>

## Transit Departures Widget
[`https://github.com/BlinkTagInc/transit-departures-widget`](https://github.com/BlinkTagInc/transit-departures-widget)
<div style={{ display: 'flex', gap: 20 }}>
  <div style={{ width: 100, flexShrink: 0 }}><img src="https://github.com/BlinkTagInc/transit-departures-widget/raw/main/docs/images/transit-departures-widget-logo.svg" alt="Transit Departures Widget" width="100" /></div>
  <div>The <a href="https://github.com/BlinkTagInc/transit-departures-widget">Transit Departures Widget</a> generates a user-friendly transit realtime departures widget in HTML format directly from GTFS and GTFS-RT transit data. Most transit agencies have schedule data in GTFS format and many publish realtime departure information using GTFS-RT. This project generates HTML, JS and CSS for use on a transit agency website to allow users to see when the next vehicle is departing from a specific stop and includes features like caching, auto-refresh, url parameters and custom templates.</div>
</div>

## GTFS Accessibility Validator
[`https://github.com/BlinkTagInc/gtfs-accessibility-validator`](https://github.com/BlinkTagInc/gtfs-accessibility-validator)
<div style={{ display: 'flex', gap: 20 }}>
  <div style={{ width: 100, flexShrink: 0 }}><img src="https://github.com/BlinkTagInc/gtfs-accessibility-validator/raw/main/docs/images/gtfs-accessibility-validator-logo.svg" alt="Transit Departures Widget" width="100" /></div>
  <div>The <a href="https://github.com/BlinkTagInc/gtfs-accessibility-validator">GTFS Accessibility Validator</a> checks transit data in GTFS format for fields and files related to accessibility. The accessibility guidelines are taken from the <a href="https://dot.ca.gov/cal-itp/california-transit-data-guidelines-v3_0#section-checklist">California Transit Data Guidelines</a> published by Caltrans.</div>
</div>

## GTFS Text-to-Speech Tester
[`https://github.com/BlinkTagInc/node-gtfs-tts`](https://github.com/BlinkTagInc/node-gtfs-tts)
<div style={{ display: 'flex', gap: 20 }}>
  <div style={{ width: 100, flexShrink: 0 }}><img src="https://github.com/BlinkTagInc/node-gtfs-tts/raw/main/docs/images/gtfs-tts-logo.svg" alt="Transit Departures Widget" width="100" /></div>
  <div>The <a href="https://github.com/BlinkTagInc/node-gtfs-tts">GTFS Text-to-Speech Tester</a> is a command-line tool that will read all GTFS stop names using Text-to-Speech and allow flagging which names need Text-to-Speech values for tts_stop_name in stops.txt. Using this tool is the quickest way to determine which stops need phonetic spellings, abbreviations written out, large digits written as words, ordinals written out or other changes so that they can be read.</div>
</div>

## `node-gtfs-realtime`
[`https://github.com/BlinkTagInc/node-gtfs-realtime`](https://github.com/BlinkTagInc/node-gtfs-realtime)
<div style={{ display: 'flex', gap: 20 }}>
  <div style={{ width: 100, flexShrink: 0 }}><img src="https://github.com/BlinkTagInc/node-gtfs-realtime/raw/main/docs/images/node-gtfs-realtime-logo.svg
  " alt="Transit Departures Widget" width="100" /></div>
  <div>GTFS-realtime transit data is in <a href="https://developers.google.com/protocol-buffers">protobuf format</a> which means its not human-readable by default. <code>node-GTFS-Realtime</code> aims to make it fast and easy to inspect GTFS-realtime data by providing a one-line command for downloading GTFS-realtime format data and converting to JSON. Try it out by running <code>npx gtfs-realtime http://api.bart.gov/gtfsrt/tripupdate.aspx</code> in your terminal.</div>
</div>
