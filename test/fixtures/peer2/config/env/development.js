var port =  Math.floor(Math.random() * (65000 - 10000 + 1) + 10000);


module.exports = {
  // models: {
  //  connection: 'postgres'
   
  // },
  port: process.env.PORT === undefined ? port : process.env.PORT,
  log: {
    level: process.env.LOG_LEVEL === undefined ? 'verbose' : process.env.PORT
   }
};
