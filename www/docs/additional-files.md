---
id: additional-files
title: Why Additional Files?
---

You can better control timetable generation by adding some additional, non-standard .txt files to your GTFS.

## Controlling timetable output
By default, GTFS-to-HTML attempts to generate a timetable for each route and direction present in a GTFS file. However, greater control over which routes, directions and days of the week should be built into timetables is possible by adding `timetables.txt`, `timetable_pages.txt` and `timetable_stop_order.txt` files to an your GTFS.

* [timetables.txt](/docs/timetables) - Specifies which HTML timetables should be built based on route_id, direction_id, days of the week and a date range. Often, this is the only additional file you'll need.
* [timetable_stop_order.txt](/docs/timetable-stop-order) - Specifies the stop order that should be used for timetables.
* [timetable_pages.txt](/docs/timetable-pages) - Specifies which HTML timetables should be grouped together into a single HTML page.

## Adding notes to timetables
Notes about a specific trip, stop, stoptime, route or timetable can be added to timetables by using `timetable_notes.txt` and `timetable_notes_references.txt` in your GTFS.

* [timetable_notes.txt](/docs/timetable-notes) - Specifies notes to be used in timetables.
* [timetable_notes_references.txt](/docs/timetable-notes-references) - Specifies where notes should be placed in timetables.

## Additional info about a stop
Additional information about a stop can be added using `stop_attributes.txt` in your GTFS.

* [stop_attributes.txt](/docs/stop-attributes) - Specifies additional information about a stop.
