import { beginCell, contractAddress, toNano, Cell, Address } from "ton";
import { deploy } from "./utils/deploy";
import { printAddress, printDeploy, printHeader } from "./utils/print";
// ================================================================= //
import { Token, storeUploadContent } from "./output/sample_Token";
import { JettonDefaultWallet } from "./output/sample_JettonDefaultWallet";

import { buildOnchainMetadata } from "./build_data";
import metadata from "./data.json";
import { NftCollection } from "./output/sample_NftCollection";
// ================================================================= //

const OFFCHAIN_CONTENT_PREFIX = 0x01;
const string_first = "https://s.getgems.io/nft-staging/c/628f6ab8077060a7a8d52d63/";
let newContent = beginCell().storeInt(OFFCHAIN_CONTENT_PREFIX, 8).storeStringRefTail(string_first).endCell();

(async () => {
    // The Transaction body we want to pass to the smart contract
    // Build onchain metadata
    let body = beginCell()
        .store(
            storeUploadContent({
                $$type: "UploadContent",
                content: buildOnchainMetadata(metadata),
            })
        )
        .endCell();

    // Parameters
    let owner = Address.parse("EQD1ptyvitBi3JbHaDQt_6j-15ABn9BqdABTFA1vgzs3Ae6z");
    let collection_init = await NftCollection.init(owner, newContent, {
        $$type: "RoyaltyParams",
        numerator: 350n, // 350n = 35%
        denominator: 1000n,
        destination: owner,
    });

    let collection_address = contractAddress(0, collection_init);
    let init = await Token.init(owner, collection_address);
    let address = contractAddress(0, init);
    let deployAmount = toNano("0.1");
    let testnet = true;

    // Do deploy
    await deploy(init, deployAmount, body, testnet);
    printHeader("Upload content");
    printAddress(address);
})();
