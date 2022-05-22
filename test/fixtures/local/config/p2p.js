module.exports.p2p = {
  host:  "127.0.0.1",
  peers: [
    {
      host: "127.0.0.1",
      port: 6969
    }
  ],
  migrate: true,
  models: {
    public: ['pub'],
    grab: ['pub']
  },
  showLog: true,
  lastUpdate: 3 * 24 * 60 * 60 * 1000, // 3 days
  password: 'test'
};