---
id: additional-files
title: Why Additional Files?
---

You can gain greater control and flexibility over timetable generation in GTFS-to-HTML by including several optional, non-standard `.txt` files in your GTFS dataset.

## Customizing Timetable Output

By default, GTFS-to-HTML generates a timetable for each route and direction found in your GTFS feed. For advanced customization—such as specifying which routes, directions, or days of the week to include—you can add the following files:

- [`timetables.txt`](/docs/timetables): Define which HTML timetables to generate, based on `route_id`, `direction_id`, days of the week, and date ranges.  
  
  _Tip: This is often the only additional file you’ll need for basic customization._
- [`timetable_stop_order.txt`](/docs/timetable-stop-order): Specify the exact stop order for specific timetables, overriding the default GTFS stop sequence.
  
  _Tip: Use this for complicated routes where not all trips serve all stops._
- [`timetable_pages.txt`](/docs/timetable-pages): Group multiple timetables together into a single HTML page.

  _Tip: Use this to put both direstions of a route, or weekend and weekday timetables all on the same page. Can also be used to put related routes on the same page._

## Adding Notes to Timetables

You can annotate your timetables with custom notes for specific trips, stops, stop times, routes, or entire timetables. Notes support Markdown formatting, allowing you to include links and rich text.

- [`timetable_notes.txt`](/docs/timetable-notes): Define the content of notes to be displayed in timetables.
- [`timetable_notes_references.txt`](/docs/timetable-notes-references): Specify where each note should appear (e.g., linked to a particular trip, stop, or timetable).

_Example use cases:_
- Indicate accessibility features for a stop.
- Add notes about a specific trip.
- Link to external resources for more information.

## Adding Extra Information to Stops

To provide additional details about stops:

- [`stop_attributes.txt`](/docs/stop-attributes): Add extra fields and information for each stop.
