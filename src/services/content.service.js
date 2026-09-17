import functions from '../data/functions.json' with { type: 'json' };
import spaces from '../data/spaces.json' with { type: 'json' };
import roadmap from '../data/roadmap.json' with { type: 'json' };
import faq from '../data/faq.json' with { type: 'json' };
import { isVisible } from '../config/content-status.js';
export const getFunctions = () => functions.filter(isVisible);
export const getSpaces = () => spaces.filter(isVisible);
export const getRoadmap = () => roadmap;
export const getFaq = () => faq.filter(isVisible);
