const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const ctx = cloud.getWXContext();
  return {
    ok: true,
    data: {
      openid: ctx.OPENID,
      appid: ctx.APPID,
      unionid: ctx.UNIONID || '',
    },
  };
};
