---
id: timetables
title: timetables.txt
---


This is an optional, non-standard file called `timetables.txt` which can be included in an agency's GTFS. This file specifies to GTFS-to-HTML which HTML timetables should be built.

An example of this file is located in [examples/timetables.txt](https://github.com/BlinkTagInc/gtfs-to-html/blob/master/examples/timetables.txt). The format of this file is:

| column name | description |
| ----------- | ----------- |
| `timetable_id` | A unique ID for the timetable |
| `route_id` | The ID of the route the timetable is for from `routes.txt`. |
| `direction_id` | The `direction_id` from `trips.txt` for the timetable. This can be blank. |
| `start_date` | The start date for this timetable in `YYYY-MM-DD` format. |
| `end_date` | The end date for this timetable in `YYYY-MM-DD` format. |
| `monday` | A binary value that indicates whether this timetable should include service on Mondays. Valid options are `0` and `1`. |
| `tuesday` | A binary value that indicates whether this timetable should include service on Tuesdays. Valid options are `0` and `1`. |
| `wednesday` | A binary value that indicates whether this timetable should include service on Wednesdays. Valid options are `0` and `1`. |
| `thursday` | A binary value that indicates whether this timetable should include service on Thursdays. Valid options are `0` and `1`. |
| `friday` | A binary value that indicates whether this timetable should include service on Fridays. Valid options are `0` and `1`. |
| `saturday` | A binary value that indicates whether this timetable should include service on Saturdays. Valid options are `0` and `1`. |
| `sunday` | A binary value that indicates whether this timetable should include service on Sundays. Valid options are `0` and `1`. |
| `include_exceptions` | A binary value that indicates whether or not to include exceptions of type `1` from `calendar_dates.txt`, such as holiday service on a weekday. Valid options are `0` and `1`. Optional, defaults to `0` (exceptions are not included by default). |
| `timetable_label` | A short text label describing the timetable, for instance "Route 4 Northbound Mon-Fri". Optional, defaults to route name and first and last stops. |
| `service_notes` | Text shown on the timetable about the service represented. Optional. |
| `orientation` | Determines if the top row should be a list of trips or stops. Valid options are `vertical`, `horizontal` or `hourly`. `vertical` shows stops across the top row with each row being a list of stop times for each trip. `horizontal` shows trips across the top row with each row being stop times for a specific stop. `hourly` is for routes that run the same time each hour and will print a simplified schedule showing minutes after the hour for each stop. `horizontal` orientation is best for routes with lots of stops and fewer trips while `vertical` orientation is best for routes with lots of trips and a smaller number of stops. Default is `vertical` |
| `timetable_page_id` | The timetable page to include this timetable on |
| `timetable_sequence` | The order that this timetable should appear on the timetable page |
| `direction_name` | The human readable name of the direction of the timetable, such as "Southbound" |
| `show_trip_continuation` | A binary value that indicates whether this timetable should show an additional column(s) or row(s) indicating which trips continue from a different route or continue on as a different route. This is calculated by trips that share the same `block_id` in `trips.txt`. Valid options are `0` and `1`.  Optional, defaults to `0`. |


## Multi-route Timetables

To allow creating a single timetable for multiple routes that overlap, you can have multiple entries in `timetables.txt` for the same `timetable_id`. All fields should be the same for each row in `timetables.txt` for a combined route timetable except `route_id`.

