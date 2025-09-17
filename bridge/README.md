# JSON log analyzer

This is a small local dev tool to analyze structured json logs. 
Logs could be either copy-pasted to the input textarea or one can use
the locally available kube context to pull logs from clusters live.

This tools is not for debugging issues historically/that happened in 
the past, it's for "live" debugging, watching/filtering logs as they happen.

## How to run

As a prerequisite, you have to have nodejs (LTS) and npm installed.

Simply type `npx json-log-analyzer` into a console of your choise, then
open the app in any browser on the url that is reported in the console.