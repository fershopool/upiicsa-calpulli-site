import { siteBase } from './site-base.js';

export const environment = { baseUrl: import.meta.env?.VITE_BASE_URL || siteBase || '/', ollinUrl: import.meta.env?.VITE_OLLIN_URL || '', externalContactUrl: import.meta.env?.VITE_EXTERNAL_CONTACT_URL || '' };
