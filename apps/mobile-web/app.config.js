/**
 * Dynamic config keeps `app.json` as the source of truth and only adds a
 * static base path when EXPO_BASE_URL is set (GitHub Pages project sites).
 */
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  const experiments = { ...config.experiments };

  if (baseUrl) {
    experiments.baseUrl = baseUrl;
  }

  return {
    ...config,
    experiments,
  };
};
