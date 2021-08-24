var express = require('express');
var router = express.Router();

const Web3 = require('web3'); 
var Tx = require('ethereumjs-tx').Transaction;
const fs = require('fs');

const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.ETH_RPC_SERVER));
console.log("Setting up Web3");
web3.eth.getNodeInfo().then(result => console.log('Network='+result));

const contractAddress = process.env.ETH_CONTRACT_ADDRESS;
let rawABI = fs.readFileSync(process.env.ETH_CONTRACT_ABI);
let ABI = JSON.parse(rawABI);
const account = process.env.ETH_ACCOUNT;
const privateKey = process.env.ETH_PRIVATE_KEY;
var evaluationContract = new web3.eth.Contract(ABI, contractAddress);


router.get('/listen', async function(req, res, next) {
  evaluationContract.events.allEvents({
    fromBlock: 0
  }, function (error, event) {
    if (error) {
      console.log("Event error="+error);
    }
    else if (event.event =="watchState") {
      console.log("watchState="+JSON.stringify(event.returnValues));
    }
    else if(event.event=="interopCall"){
      console.log("interopCall="+JSON.stringify(event.returnValues))
    }
    else {
      console.log("Event="+event.event);
    }
  });
  res.send();
});


router.get('/read', async function(req, res, next) {
  var value = await evaluationContract.methods.readState().call();
  console.log("value="+value);
  res.send(value);
});

router.post('/write/:newState', async function(req, res, next) {
  const nonce = await web3.eth.getTransactionCount(account);
  var newState = req.params.newState;
  const _writeState = evaluationContract.methods.writeState(newState).encodeABI();
  var rawTx = {
    nonce: nonce,
    gas: '0x30000',
    to: contractAddress,
    from: account,
    value: 0,
    data: _writeState
  }

  const signed  = await web3.eth.accounts.signTransaction(rawTx, privateKey);
  const transaction = await web3.eth.sendSignedTransaction(signed.rawTransaction);
  console.log("Transaction="+transaction.transactionHash);
  res.send(transaction.transactionHash);
});

router.post('/call', async function(req, res, next) {
  const nonce = await web3.eth.getTransactionCount(account);
  var value = await evaluationContract.methods.readState().call();
  console.log("Value="+value);
  const signedData = await web3.eth.accounts.sign(req.body.interopDID + req.body.func + value + req.body.callerDID + nonce, privateKey);
  console.log("Params=", req.body);
  const _callInterop = evaluationContract.methods.callInterop(req.body.interopDID, req.body.func, req.body.callerDID, nonce, signedData.signature).encodeABI();
  var rawTx = {
    nonce: nonce,
    gas: '0x40000',
    to: contractAddress,
    from: account,
    value: 0,
    data: _callInterop
  }

  const signed  = await web3.eth.accounts.signTransaction(rawTx, privateKey);
  const transaction = await web3.eth.sendSignedTransaction(signed.rawTransaction);
  console.log("Transaction="+transaction.transactionHash);
  res.send(transaction.transactionHash);
  
});

module.exports = router;
