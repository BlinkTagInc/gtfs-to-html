/* eslint-disable no-unused-vars */
import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';

const features = [
  {
    title: <>Why?</>,
    imageUrl: 'img/undraw_proud_coder.svg',
    description: (
      <>
        Most transit agencies have schedule data in GTFS format but need to show
        each route's schedule to users on a website.
      </>
    ),
  },
  {
    title: <>What?</>,
    imageUrl: 'img/undraw_spreadsheets.svg',
    description: (
      <>
        This tool automates the process of creating nicely formatted HTML
        timetables for inclusion on a transit agency website.
      </>
    ),
  },
  {
    title: <>Automate schedule changes</>,
    imageUrl: 'img/undraw_happy_music.svg',
    description: (
      <>
        Automating timetable creation means that timetables can be kept up to
        date and accurate when schedule changes happen and the likelihood of
        errors is reduced.
      </>
    ),
  },
];

function Feature({ imageUrl, title, description }) {
  const imgUrl = useBaseUrl(imageUrl);
  return (
    <div className={clsx('col col--4', styles.feature)}>
      {imgUrl && (
        <div className="text--center">
          <img className={styles['feature-image']} src={imgUrl} alt="" />
        </div>
      )}
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function Home() {
  const context = useDocusaurusContext();
  const { siteConfig = {} } = context;
  return (
    <Layout
      title="GTFS-to-HTML"
      description="GTFS-to-HTML creates human-readable, user-friendly transit timetables in HTML format directly from GTFS transit data."
    >
      <header className={clsx('hero hero--dark', styles['hero-banner'])}>
        <div className="container">
          <div className="row">
            <div className="col col--4">
              <img
                src="/img/gtfs-to-html-logo.svg"
                style={{ maxWidth: '150px' }}
                alt=""
              />
            </div>

            <div className="col col--8">
              <h1 className="hero__title">{siteConfig.title}</h1>
              <p className="hero__subtitle">{siteConfig.tagline}</p>
              <img
                alt="npm"
                src="https://img.shields.io/npm/v/gtfs-to-html?color=%2325c2a0&amp;label=stable&amp;style=for-the-badge"
                className="margin-bottom--sm"
              />
              <div className={styles.buttons}>
                <Link
                  className={clsx(
                    'button button--outline button--secondary button--lg',
                    styles['hero-button']
                  )}
                  to={useBaseUrl('docs/')}
                >
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main>
        {features && features.length > 0 && (
          <section className={styles.features}>
            <div className="container">
              <div className="row">
                {features.map((props, idx) => (
                  <Feature key={idx} {...props} />
                ))}
              </div>
            </div>
          </section>
        )}

        <section className={clsx('padding--lg', styles['gray-section'])}>
          <div className="container">
            <div className="row">
              <div className="col"></div>
              <div className="col">
                <div className="avatar avatar--vertical margin-bottom--sm">
                  <div className="avatar__photo avatar__photo--xl">
                    <img
                      src="https://avatars.githubusercontent.com/u/46612183?v=4"
                      alt="Brody"
                      width="200"
                      height="200"
                      style={{
                        width: '100%',
                        height: 'auto',
                        maxWidth: '100%',
                        marginBottom: '-4px',
                      }}
                    />
                  </div>
                  <div className="avatar__intro padding-top--sm">
                    <div className="avatar__name">Brody</div>
                    <small className="avatar__subtitle">
                      <a href="https://github.com/transcollines">
                        Transcollines
                      </a>
                    </small>
                  </div>
                </div>
                <p className="text--center text--italic padding-horiz--md">
                  It's been a huge success. Not only do the timetables look
                  fantastic, but I've had customer service agents tell me the
                  interactive timetables are a total game changer and they make
                  their jobs way easier.
                </p>
              </div>
              <div className="col"></div>
            </div>
          </div>
        </section>

        <div className={clsx(styles.buttons, 'margin-top--lg')}>
          <a
            className="button button--primary button--lg"
            href="https://www.npmjs.com/package/gtfs-to-html"
          >
            npm install -g gtfs-to-html
          </a>
        </div>

        <div className={clsx(styles.buttons, 'margin-top--md')}>
          <strong>OR</strong>
        </div>

        <div className={clsx(styles.buttons, 'margin-top--md')}>
          <a
            className="button button--primary button--lg"
            href="https://run.gtfstohtml.com"
          >
            Use the web-based version
          </a>
        </div>

        <div className={clsx(styles.buttons)}>
          <div>(For smaller GTFS files only)</div>
        </div>

        <div className={clsx(styles.buttons, 'margin-top--md')}>
          <strong>OR</strong>
        </div>

        <div className={clsx(styles.buttons, 'margin-top--md')}>
          <a
            className="button button--primary button--lg"
            href="/docs/quick-start#docker-usage"
          >
            Use Docker
          </a>
        </div>

        <section>
          <div className="container margin-top--xl margin-bottom--lg">
            <div className="row">
              <div className="col col--8 col--offset-2">
                <h2>Example Usage</h2>
                <CodeBlock language="bash">{gtfsToHtmlCodeBlock}</CodeBlock>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="container margin-top--lg margin-bottom--lg">
            <div className="row">
              <div className="col col--12">
                <h2>Example Output</h2>
              </div>
            </div>
            <div className="row">
              <div className="col col--6">
                <img src="/img/timetable-example.jpg" alt="Timetable Example" />
              </div>
              <div className="col col--6">
                <img src="/img/overview-example.jpg" alt="Overview Example" />
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}

const gtfsToHtmlCodeBlock = `
❯ gtfs-to-html

Starting GTFS import for 1 file
caltrain: Importing GTFS from http://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip
caltrain: Importing - agency.txt - 1 lines imported
caltrain: Importing - calendar_dates.txt - 8 lines imported
caltrain: Importing - calendar.txt - 3 lines imported
caltrain: Importing - fare_attributes.txt - 6 lines imported
caltrain: Importing - fare_rules.txt - 144 lines imported
caltrain: Importing - feed_info.txt - No file found
caltrain: Importing - frequencies.txt - No file found
caltrain: Importing - routes.txt - 4 lines imported
caltrain: Importing - shapes.txt - 3008 lines imported
caltrain: Importing - stop_times.txt - 3103 lines imported
caltrain: Importing - stops.txt - 95 lines imported
caltrain: Importing - transfers.txt - No file found
caltrain: Importing - trips.txt - 218 lines imported
caltrain: Post Processing data
caltrain: Completed GTFS import
Completed GTFS import for 1 file
caltrain: Generating HTML timetables [====================] 20/20

caltrain: HTML timetables created at html/caltrain
┌────────────────────────────────────────┬────────────────────┐
│ Item                                   │ Count              │
├────────────────────────────────────────┼────────────────────┤
│ 📄 Timetable Pages                     │ 20                 │
├────────────────────────────────────────┼────────────────────┤
│ 🕑 Timetables                          │ 20                 │
├────────────────────────────────────────┼────────────────────┤
│ 📅 Calendar Service IDs                │ 20                 │
├────────────────────────────────────────┼────────────────────┤
│ 🔄 Routes                              │ 20                 │
├────────────────────────────────────────┼────────────────────┤
│ 🚍 Trips                               │ 260                │
├────────────────────────────────────────┼────────────────────┤
│ 🛑 Stops                               │ 308                │
└────────────────────────────────────────┴────────────────────┘
caltrain: HTML timetable generation required 12 seconds
`;

export default Home;
