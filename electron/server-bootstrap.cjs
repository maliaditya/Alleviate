const Module = require("node:module");
const path = require("node:path");

process.env.NODE_PATH = path.join(__dirname, "modules");
Module._initPaths();
require(path.join(__dirname, "server.js"));
