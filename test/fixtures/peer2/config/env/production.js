module.exports = {
  // models: {
  //   connection: 'postgres',
  //   migrate: 'safe'
  // },
  adminpanel:{
    auth: true
  },
  log: {
    level: 'info'
  },
  port: process.env.PORT === undefined ? 1337 : process.env.PORT,
  log: {
   level: "verbose"
  }
};
