const fs = require("fs");

module.exports=(user,action)=>{

const log =
`${new Date()} | ${user} | ${action}\n`;

fs.appendFileSync(
 "security-audit.log",
 log
);

};