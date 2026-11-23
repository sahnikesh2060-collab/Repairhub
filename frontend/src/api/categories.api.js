import { data, http } from './client.js';

export const listCategories = () => data(http.get('/categories')).then((d) => d.categories);
