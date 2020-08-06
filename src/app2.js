"use strict";

import Mongodb from 'mongodb';
import Dotenv from 'dotenv';
import validate from 'bitcoin-address-validation';
import Transactions1 from '../transactions/transactions-1.json';
import Transactions2 from '../transactions/transactions-2.json';
import Customers from '../customers.json';

let IRA = 0, WC = 0, LC = 0;

//Import environment variables
const result = Dotenv.config();
if (result.error) throw result.error;


async function main() {
    
    //==========================================================================================================
    /*  STAGE 1: 
        ========
        Read all transactions from `transactions-1.json` and `transactions-2.json` 
        and store all deposits in a database of your choice.
    */

    //Connect to MongoDB
    const MongoClient = Mongodb.MongoClient;
    var uri = process.env.MONGO_CONNECTION_STRING;
    const Client = new MongoClient(uri, { useUnifiedTopology: true }); // useUnifiedTopology removes a warning
    await Client.connect();

    //Delete previous collection in the tables-- TODO: Remove when not testing
    /*Client
        .db(process.env.MONGO_DB_NAME)
        .collection(process.env.TX_COLLECTION_NAME)
        .drop((err, result)=>{
            if(err) throw err;*/

    //Read all the transactions from the 2 JSON files altogether and save into txs
    let txs = Transactions1["transactions"].concat(Transactions2["transactions"]);
    
    let deposits = []; //Array to hold deposit transactions

    let output = {
        names:[],
        counts: [],
        sums: [],
        unknownCount: 0,
        unknownSum: 0,
        smallest: 0,
        largest: 0
    };

    /*  Foreach transaction,
        Consider only deposits,
        verify its validity and mark it as either valid or not(you will need this mark later),
        store it in your deposits array.
    */
    txs.forEach(tx => {

        // 1. Consider only deposit transactions
        if(tx.category != 'receive') return; //Not a deposit transaction - move on to next one
        
        // 2. Ensure deposit has not been previously saved in DB to avoid storing duplicates, check for confirmation updates
        Client
            .db(process.env.MONGO_DB_NAME)
            .collection(process.env.TX_COLLECTION_NAME)
            .find({txid:tx.txid},(result)=>{
                if(result) console.log(result); //duplicate found.. check for different confirmation count and update db
                // 3. Determine deposit validity - adds validity-related property to the tx object
                let vResult = verify(tx);  
                tx["validityStatus"]  = vResult["status"];//true or false for valid or invalid deposit respectively
                tx["validityViolations"] = vResult["violations"]; //if deposit was invalid, this property says why.

                // 4. Mark known/unkown recepient address
                markKnowntx(tx, (result) => {
                    tx["known"] = result;
                

                    // 5. Push deposit transaction to deposits array
                    deposits.push(tx);

                    // Insert all extracted deposits into the database -- done outside the loop for efficiency
                    addSingletx(tx);
                }); // end mark known 
            }); //end find Duplicate txs

    }); //end foreach Tx

    console.log(deposits.length);
    

             //STAGE 1 COMPLETE    
            //==========================================================================================================
            /*  STAGE 2:
                ========
                Read deposits from the database that are good to credit to users
            */
           

                    /*let query = [
                        { 
                            $match: { 
                                validityStatus: true 
                            } 
                        },
                        {
                            $group: {
                              _id: null, 
                              total: {
                                $sum: "$amount"
                              },
                              min_transaction_amount: {
                                $min: "$amount"
                              },
                              max_transaction_amount: {
                                $max: "$amount"
                              }
                            }
                          }
                     ];

                    Client
                        .db(process.env.MONGO_DB_NAME)
                        .collection(process.env.TX_COLLECTION_NAME)
                        .aggregate(query, function(err, result){
                            if(err) throw err;
                            console.log(result);
                        });*/

                        Client
                        .db(process.env.MONGO_DB_NAME)
                        .collection(process.env.CUSTOMER_COLLECTION_NAME)
                        .find().toArray(function(err, customers){
                            
                            customers.forEach(customer => {
                                console.log(customer.name);
                                output.names.push(customer.name);
                                //Fetch the db for all valid deposits with this address:
                                let query = {address:customer.address, validityStatus:true};
                                Client
                                    .db(process.env.MONGO_DB_NAME)
                                    .collection(process.env.TX_COLLECTION_NAME)
                                    .find(query).project({'_id':false, 'amount':true}).toArray(function(err, txPerCustomer) {
                                        if (err) throw err; 
                                        output.counts.push(txPerCustomer.length);
                                        output.sums.push(0); //Calculate sums of all returned valid tx's for this customer

                                        txPerCustomer.forEach(customerTx=>{
                                            output.sums[output.sums.length-1] += customerTx.amount;
                                        });// end foreach amount 
        
                                        //console.log("Deposited for " + output.names[i] + ": count=" + output.counts[i] + " sum=" + output.sums[i]);
                                        console.log(output);

                                        //findUnreferencedData();
                                    }); // end find amounts 

                                }); // end for loop on customers

                            });//end find all customers


                            // 4. Determine if the address is known to us as of now--it may become known to us later.
                            /*let query = [
                                { $lookup:
                                {
                                    from: process.env.CUSTOMER_COLLECTION_NAME,
                                    localField: 'address',
                                    foreignField: 'address',
                                    as: 'customerDetails'
                                }
                                }
                                ];
                            /*Client
                                .db(process.env.MONGO_DB_NAME)
                                .collection(process.env.TX_COLLECTION_NAME)
                                .aggregate(query).toArray(function(err,result){               

                                    /*if(result['customerDetails'].length > 0) //known customer
                                    {
                                        tx["knownAddress"] = true;
                                    }
                                    else tx["knownAddress"] = false; *

                                    console.log(result[2]);
                                });// end aggregate call*/


                            //if(i == customers.length-1) // this check is done too early before i reaches 7, and the connection is never closed :(


                //STAGE 2 COMPLETE    
                //==========================================================================================================
                /*  OUTPUT:
                    =======
                    Print the following 8 lines on stdout:
                    ```
                    Deposited for Wesley Crusher: count=n sum=x.xxxxxxxx
                    Deposited for Leonard McCoy: count=n sum=x.xxxxxxxx
                    Deposited for Jonathan Archer: count=n sum=x.xxxxxxxx
                    Deposited for Jadzia Dax: count=n sum=x.xxxxxxxx
                    Deposited for Montgomery Scott: count=n sum=x.xxxxxxxx
                    Deposited for James T. Kirk: count=n sum=x.xxxxxxxx
                    Deposited for Spock: count=n sum=x.xxxxxxxx
                    Deposited without reference: count=n sum=x.xxxxxxxx
                    Smallest valid deposit: x.xxxxxxxx
                    Largest valid deposit: x.xxxxxxxx
                    ```
                    The numbers in lines 1 - 7 **MUST** contain the count of valid deposits and their sum for the respective customer.
                    The numbers in line 8 **MUST** be the count and the sum of the valid deposits to addresses that are not associated with a known customer.
                */
            
        //});// end insertMany

    //}); // end delete previous collection-- TODO: Remove when not testing

} //end main

/**
 * 
 * @param {transactionObject} tx 
 * returns validity object:
 *          - validity.Status: (bool) True if tx is a valid deposit, false otherwise, and
 *          - validity.Violations: (string) Explaining why the tx is considered invalid, null if tx is valid.
 */

function verify(tx)
{
    // Start with assuming true validity
    let validity = {
                        status: true,
                        violations: ""
                    };

    //Perform validity checks:

    // 0. Ensure tx is correct
    /*  
    It is given that the txs are returned by rpc calls to bitcoind,
    but this is to ensure the files were not altered.
    E.g. No fake txs were injected in them / No incorrect details of transactions
    */
        // 0.a Transaction exists on the bitcoin network (txid comparison)

        // 0.b Transaction details are accurate (txhash comparison) - Checking tx hash ensures all its details are accurate

    // 1. At least 6 confirmations.
    if(tx.confirmations < 6) //{console.log('Less than 6 confirmations.'); return false;}
    {
        validity.status = false;
        validity.violations += "\n-Less than 6 confirmations.";
        LC++;
    }

    // 2. Recepient is a valid bitcoin address - this check should be made when sending the tx to minimize burning btc.
    if(validate(tx.address) == false) //{console.log('Invalid recepient address'); return false;}
    {
        validity.status = false;
        validity.violations += "\n-Invalid recepient address.";
        IRA++;
    }

    // 3. Block timestamp no more than 2 hours in the future

    // 4. Blockhash satisfies nBits proof of work
    
    // 5. No wallet conflicts
    if(!tx.walletconflicts.length == 0) 
    {
        validity.status = false;
        validity.violations += "\n-Wallet conflicts.";
        WC++;
    }

    return validity;
}

async function findUnreferencedData()
{
    try{
        let unref = {
            count: 0,
            sum: 0
        };
        //Connect to MongoDB
        const MongoClient = Mongodb.MongoClient;
        var uri = process.env.MONGO_CONNECTION_STRING;
        const Client = new MongoClient(uri, { useUnifiedTopology: true }); // useUnifiedTopology removes a warning
        await Client.connect();


    }finally{
        Client.close();
        return unref;
    }
}

async function markKnowntx(tx){
    try{

        //Connect to MongoDB
        const MongoClient = Mongodb.MongoClient;
        var uri = process.env.MONGO_CONNECTION_STRING;
        const Client = new MongoClient(uri, { useUnifiedTopology: true }); // useUnifiedTopology removes a warning
        await Client.connect();
            
        await Client
            .db(process.env.MONGO_DB_NAME)
            .collection(process.env.CUSTOMER_COLLECTION_NAME)
            .find({address:tx.address}).toArray((result)=>{
                if(!result) //unknown address
                    return true;
                else //unknown address
                    return false;
            });
    }finally{
        Client.close();
        return unref;
    }
}

async function addSingletx(tx){
    try{

        //Connect to MongoDB
        const MongoClient = Mongodb.MongoClient;
        var uri = process.env.MONGO_CONNECTION_STRING;
        const Client = new MongoClient(uri, { useUnifiedTopology: true }); // useUnifiedTopology removes a warning
        await Client.connect();
            
        await Client
            .db(process.env.MONGO_DB_NAME)
            .collection(process.env.TX_COLLECTION_NAME)
            .insertOne(tx);
    }finally{
        Client.close();
    }
}

main();