---
id: reviewing-changes
title: Reviewing changes between schedule updates
---

When an agency updates their schedule and releases an updated GTFS file, it can be useful to review what has changed when generating HTML timetables. There are two ways to review what has changed:

## Use `git`

Use git to version control the output of GTFS-to-HTML. Make a git repository for this purpose and check in a set of timetable HTML files. Then, when generating updated timetables overwrite the old timetables and review the changes using your favorite git tool, such as [Github Desktop](https://desktop.github.com).


## Use `diff2html`

`diff2html` is a command line tool to easily compare two folders of html timetables.

First generate two folders of GTFS-to-HTML output to compare. To make it easy to see what has changed, set the `beautify` option to `true` in the config file for both sets of output.

Then, install diff2html:

    npm install -g diff2html-cli

Use the `diff` command and pipe the output to `diff2html` to get a nicely formatted list of the differences between two folders of html files.

    diff -bur html/folder1 html/folder2 |  diff2html -i stdin
