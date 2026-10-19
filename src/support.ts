// Entry for the plain HTML donation page: the app's self-hosted fonts and page views, no app code.
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import './support.css';
import { startPageViews } from './telemetry';

startPageViews();
