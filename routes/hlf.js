var express = require('express');
var router = express.Router();
const FabricCAServices = require('fabric-ca-client');
const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

router.get('/enroll', async function(req, res, next) {
  try {
    // load the network configuration
    const ccpPath = path.resolve(__dirname, 'connection-org1.json');
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    // Create a new CA client for interacting with the CA.
    const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
    const caTLSCACerts = caInfo.tlsCACerts.pem;
    const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

    // Create a new file system based wallet for managing identities.
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    console.log(`Wallet path: ${walletPath}`);

    // Check to see if we've already enrolled the admin user.
    const identity = await wallet.get('admin');
    if (identity) {
        console.log('An identity for the admin user "admin" already exists in the wallet');
        return;
    }

    // Enroll the admin user, and import the new identity into the wallet.
    const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
    const x509Identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes(),
        },
        mspId: 'Org1MSP',
        type: 'X.509',
    };
    await wallet.put('admin', x509Identity);
    console.log('Successfully enrolled admin user "admin" and imported it into the wallet');

  } catch (error) {
    console.error(`Failed to enroll admin user "admin": ${error}`);
    res.send(`Failed to enroll admin user "admin": ${error}`);
  }
  console.log('Admin enrolled');
  res.send('Admin enrolled');
});

router.get('/register', async function(req, res, next) {
  try {
    // load the network configuration
    const ccpPath = path.resolve(__dirname, 'connection-org1.json');
      const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    // Create a new CA client for interacting with the CA.
    const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
    const ca = new FabricCAServices(caURL);

    // Create a new file system based wallet for managing identities.
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    console.log(`Wallet path: ${walletPath}`);

    // Check to see if we've already enrolled the user.
    const userIdentity = await wallet.get('appUser');
    if (userIdentity) {
        console.log('An identity for the user "appUser" already exists in the wallet');
        return;
    }

    // Check to see if we've already enrolled the admin user.
    const adminIdentity = await wallet.get('admin');
    if (!adminIdentity) {
        console.log('An identity for the admin user "admin" does not exist in the wallet');
        console.log('Run the enrollAdmin.js application before retrying');
        return;
    }

    // build a user object for authenticating with the CA
    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, 'admin');

    // Register the user, enroll the user, and import the new identity into the wallet.
    const secret = await ca.register({
        affiliation: 'org1.department1',
        enrollmentID: 'appUser',
        role: 'client'
    }, adminUser);
    const enrollment = await ca.enroll({
        enrollmentID: 'appUser',
        enrollmentSecret: secret
    });
    const x509Identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes(),
        },
        mspId: 'Org1MSP',
        type: 'X.509',
    };
    await wallet.put('appUser', x509Identity);
    console.log('Successfully registered and enrolled admin user "appUser" and imported it into the wallet');

  } catch (error) {
    console.error(`Failed to register user "appUser": ${error}`);
    res.send(`Failed to register user "appUser": ${error}`);
  }
  console.log('User apUser registered');
  res.send('User apUser registered');
});

router.get('/listen', async function(req, res, next) {
  res.send('HLF respond with a resource');
});

router.get('/read', async function(req, res, next) {
  try {
    // load the network configuration
    const ccpPath = path.resolve(__dirname, 'connection-org1.json');
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    // Create a new file system based wallet for managing identities.
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    console.log(`Wallet path: ${walletPath}`);

    // Check to see if we've already enrolled the user.
    const identity = await wallet.get('appUser');
    if (!identity) {
        console.log('An identity for the user "appUser" does not exist in the wallet');
        console.log('Run the registerUser.js application before retrying');
        return;
    }

    // Create a new gateway for connecting to our peer node.
    const gateway = new Gateway();
    await gateway.connect(ccp, { wallet, identity: 'appUser', discovery: { enabled: true, asLocalhost: true } });

    // Get the network (channel) our contract is deployed to.
    const network = await gateway.getNetwork('mychannel');

    // Get the contract from the network.
    const contract = network.getContract('evaluation');

    // Evaluate the specified transaction.
    // queryCar transaction - requires 1 argument, ex: ('queryCar', 'CAR4')
    // queryAllCars transaction - requires no arguments, ex: ('queryAllCars')
    const result = await contract.evaluateTransaction('ReadState');
    console.log(`Transaction has been evaluated, result is: ${result.toString()}`);

    // Disconnect from the gateway.
    gateway.disconnect();
    
  } catch (error) {
      console.error(`Failed to evaluate transaction: ${error}`);
      res.send(`Failed to evaluate transaction: ${error}`);
  }
  res.send(`Transaction has been evaluated, result is: ${result.toString()}`);
});

router.post('/write/:newState', async function(req, res, next) {
  try {
    // load the network configuration
    const ccpPath = path.resolve(__dirname, 'connection-org1.json');
    let ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    // Create a new file system based wallet for managing identities.
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    console.log(`Wallet path: ${walletPath}`);

    // Check to see if we've already enrolled the user.
    const identity = await wallet.get('appUser');
    if (!identity) {
        console.log('An identity for the user "appUser" does not exist in the wallet');
        console.log('Run the registerUser.js application before retrying');
        return;
    }

    // Create a new gateway for connecting to our peer node.
    const gateway = new Gateway();
    await gateway.connect(ccp, { wallet, identity: 'appUser', discovery: { enabled: true, asLocalhost: true } });

    // Get the network (channel) our contract is deployed to.
    const network = await gateway.getNetwork('mychannel');

    // Get the contract from the network.
    const contract = network.getContract('evaluation');

    // Submit the specified transaction.
    var newState = req.params.newState;
    await contract.submitTransaction('WriteState', newState);
    console.log('Transaction has been submitted');

    // Disconnect from the gateway.
    gateway.disconnect();

  } catch (error) {
    console.error(`Failed to submit transaction: ${error}`);
    res.send(`Failed to submit transaction: ${error}`);
  }
  res.send('HLF respond with a resource');
});

router.post('/call', async function(req, res, next) {
  res.send('HLF respond with a resource');
});

module.exports = router;
