export const InternetCheckService = {
  checkInternetConnection: async () => {
    try {
      const response = await fetch('https://www.google.com', { method: 'HEAD' });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  },
};