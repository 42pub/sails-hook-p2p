#sails-hook-p2p

Config example:
```js
module.exports.p2p = {
  peers: [
    {
        host: 'string',
        port: 'number'
    }  
  ],
  lastUpdate: 'number',
  migrate: 'boolean',
  models: {
    public: ['test'],
    grab: ['test']
  },
  password: 'string',
  privateKey: 'string'
};
```

Config description:

|name|type|description
|---|---|---
|peers|Array of peer|array of known peers
|peer|object|describe each peer
|peer.host|string|peer host or ip
|peer.port|number| peer port
|lastUpdate|number|how old records from db need to copy
|migrate|boolean|add all old records needed fields
|models|object or Array of string|describe what models can send to other peers and what can get. If it is array of string then public = grab = models
|models.public|Array of string|describe what models need to send to others peers
|models.grab|Array of string|describe what models need to get from others peers
|password|string|password must be equal for servers in one mesh
|privateKey|string|ssh key for https
