// Entry for the guide pages built from content/*.md: the legal pages' fonts and paper, plus page views.
import '@fontsource/fraunces/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './legal.css';
import './content.css';
import { startPageViews } from './telemetry';

startPageViews();
