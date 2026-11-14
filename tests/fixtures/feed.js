export const fixtureFiles = {
  'timetable_pages.txt':
    'timetable_page_id,timetable_page_label,filename\npage,Downtown,page.html\n',
  'agency.txt':
    'agency_id,agency_name,agency_url,agency_timezone\na,Test Transit,https://example.com,America/Los_Angeles\n',
  'routes.txt':
    'route_id,agency_id,route_short_name,route_long_name,route_type\n4,a,4,Downtown,3\n',
  'stops.txt':
    'stop_id,stop_name,stop_lat,stop_lon\nA,Alpha,37,-122\nB,Beta,37.01,-122.01\n',
  'trips.txt':
    'route_id,service_id,trip_id,direction_id\n4,s,out,0\n4,s,back,1\n',
  'stop_times.txt':
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nout,09:00:00,09:00:00,A,1\nout,09:10:00,09:10:00,B,2\nback,10:00:00,10:00:00,B,1\nback,10:10:00,10:10:00,A,2\n',
  'calendar.txt':
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns,1,1,1,1,1,1,1,20260101,20261231\n',
  'timetables.txt':
    'timetable_id,route_id,direction_id,start_date,end_date,monday,tuesday,wednesday,thursday,friday,saturday,sunday,timetable_label,timetable_page_id\nout,4,0,20260101,20261231,1,1,1,1,1,1,1,,page\nback,4,1,20260101,20261231,1,1,1,1,1,1,1,Express,page\n',
};
