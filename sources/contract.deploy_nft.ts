import * as fs from "fs";
import * as path from "path";

import { Address, contractAddress, beginCell } from "ton";
import { NftCollection } from "./output/sample_NftCollection";

import { prepareTactDeployment } from "@tact-lang/deployer";

const OFFCHAIN_CONTENT_PREFIX = 0x01;
const string_first = "https://s.getgems.io/nft-staging/c/628f6ab8077060a7a8d52d63/";
let newContent = beginCell().storeInt(OFFCHAIN_CONTENT_PREFIX, 8).storeStringRefTail(string_first).endCell();

(async () => {
    // Parameters
    let testnet = true;
    let packageName = "sample_NftCollection.pkg";
    let owner = Address.parse("kQBXFiq2Oc88YmUSCmxXGyHDqeq4UYo3xCSJe2yAAsMja1-u"); // Change to your address
    let init = await NftCollection.init(owner, newContent, {
        $$type: "RoyaltyParams",
        numerator: 369n, // 350n = 35%
        denominator: 1000n,
        destination: owner,
    });

    // Load required data
    let address = contractAddress(0, init);
    let data = init.data.toBoc();
    let pkg = fs.readFileSync(path.resolve(__dirname, "output", packageName));

    // Prepareing
    console.log("Uploading package...");
    let prepare = await prepareTactDeployment({ pkg, data, testnet });

    // Deploying
    console.log("============================================================================================");
    console.log("Contract Address");
    console.log("============================================================================================");
    console.log();
    console.log(address.toString({ testOnly: testnet }));
    console.log();
    console.log("============================================================================================");
    console.log("Please, follow deployment link");
    console.log("============================================================================================");
    console.log();
    console.log(prepare);
    console.log();
    console.log("============================================================================================");
})();
