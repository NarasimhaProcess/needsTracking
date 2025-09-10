import { InternetCheckService } from './InternetCheckService';

export const NetInfoService = {
  isNetworkAvailable: async () => {
    return await InternetCheckService.checkInternetConnection();
  },
};
