import { toNano, beginCell, OpenedContract, Address } from "ton";
import { ContractSystem } from "@tact-lang/emulator";
import { Blockchain, SandboxContract, TreasuryContract } from "@ton-community/sandbox";

import { NftCollection } from "./output/sample_NftCollection";
import { NftItem } from "./output/sample_NftItem";
import { Token } from "./output/sample_Token";
import { JettonDefaultWallet, TokenTransfer, storeTokenTransfer } from "./output/sample_JettonDefaultWallet";

import exp from "constants";
import "@ton-community/test-utils";

const OFFCHAIN_CONTENT_PREFIX = 0x01;
const string_first = "https://s.getgems.io/nft-staging/c/628f6ab8077060a7a8d52d63/";
let newContent = beginCell().storeInt(OFFCHAIN_CONTENT_PREFIX, 8).storeStringRefTail(string_first).endCell();

describe("contract", () => {
    let blockchain: Blockchain;
    let collection: SandboxContract<NftCollection>;
    let deployer: SandboxContract<TreasuryContract>;
    let nft: SandboxContract<NftItem>;
    let contract_token: SandboxContract<Token>;
    let wallet_contract: SandboxContract<JettonDefaultWallet>;

    let owner: any;
    let track: any;

    beforeAll(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury("deployer");

        collection = blockchain.openContract(
            await NftCollection.fromInit(deployer.address, newContent, {
                $$type: "RoyaltyParams",
                numerator: 350n, // 350n = 35%
                denominator: 1000n,
                destination: deployer.address,
            })
        );

        const deploy_result = await collection.send(deployer.getSender(), { value: toNano(1) }, "Mint");
        expect(deploy_result.transactions).toHaveTransaction({
            from: deployer.address,
            to: collection.address,
            deploy: true,
            success: true,
        });
        // console.log("MintResult: ", deploy_result.events);

        contract_token = blockchain.openContract(await Token.fromInit(collection.address, newContent));
        const nft_item_0 = await collection.getGetNftAddressByIndex(0n)!!;
        nft = blockchain.openContract(await NftItem.fromAddress(Address.parse(nft_item_0!!.toString())));
        wallet_contract = blockchain.openContract(
            await JettonDefaultWallet.fromInit(deployer.address, deployer.address)
        );
        console.log("Deployer: " + deployer.address.toString());
        console.log("Deployer's JettonWallet: " + wallet_contract.address.toString());
        // const nft_result = await nft.send(deployer.getSender(), { value: toNano(1) }, "f");
        // expect(nft_result.transactions).toHaveTransaction({
        //     from: deployer.address,
        //     to: nft.address,
        //     deploy: true,
        //     success: true,
        // });
        // console.log("NftTransfer: ", nft_result.events);
    });

    // First Test Case
    it("should deploy correctly", async () => {
        console.log((await collection.getGetCollectionData()).next_item_index);
        console.log("CollectionAddress: " + collection.address.toString());
        console.log("NFT Item[0]" + (await collection.getGetNftAddressByIndex(0n)));
        console.log("TokenContract: " + (await collection.getGetTokenAddress()));
    });

    it("should mint correctly", async () => {
        const nft_amount = (await collection.getGetCollectionData()).next_item_index;
        const deploy_result = await collection.send(deployer.getSender(), { value: toNano(1) }, "Mint");
        expect(deploy_result.transactions).toHaveTransaction({
            from: deployer.address,
            to: collection.address,
            success: true,
        });
        const nft_amount_after = (await collection.getGetCollectionData()).next_item_index;
        expect(nft_amount_after).toBe(nft_amount + 1n);
    });

    it("should fractionalized correctly", async () => {
        // let nft_index = (await collection.getGetCollectionData()).next_item_index;
        // console.log("NFT Index: " + nft_index); // Print the NFT Index

        const nft_0 = await collection.getGetNftAddressByIndex(0n);
        let nft = blockchain.openContract(await NftItem.fromAddress(Address.parse(nft_0!!.toString())));
        // console.log(nft.address.toString()); // Print the NFT Address

        // Send the Transaction
        const tx_result = await nft.send(deployer.getSender(), { value: toNano(1) }, "f");
        expect(tx_result.transactions).toHaveTransaction({
            from: deployer.address,
            to: nft.address,
            success: true,
        });
        // console.log(tx_result.events); // Print the Transaction Result

        const jettonWallet_address = await contract_token.getGetWalletAddress(deployer.address);
        let wallet = blockchain.openContract(await JettonDefaultWallet.fromAddress(jettonWallet_address));
        console.log("JettonWallet Address: " + wallet.address.toString());

        // Get New Generate Wallet Data
        const jetton_wallet_data = await wallet.getGetWalletData();
        // console.log("Wallet Balance: " + jetton_wallet_data.balance);
        expect(jetton_wallet_data.owner).toEqualAddress(deployer.address);
    });

    it("should transfer Jetton Token correctly", async () => {
        const nft_0 = await collection.getGetNftAddressByIndex(0n);
        let nft = blockchain.openContract(await NftItem.fromAddress(Address.parse(nft_0!!.toString())));
        await nft.send(deployer.getSender(), { value: toNano(1) }, "f");

        // Get the JettonWallet Address
        let jetton_balance_of_deployer = await contract_token.getGetWalletAddress(deployer.address);
        let wallet = blockchain.openContract(await JettonDefaultWallet.fromAddress(jetton_balance_of_deployer));
        // console.log("JettonWallet Address: " + wallet.address.toString());
        console.log("JettonWallet Balance: " + (await wallet.getGetWalletData()).balance);
        console.log("Jetoon Wallet Owner: " + (await wallet.getGetWalletData()).owner.toString());

        const new_player = await blockchain.treasury("player");
        const TokenTransfer: TokenTransfer = {
            $$type: "TokenTransfer",
            queryId: 0n,
            amount: 10n,
            destination: new_player.address,
            responseDestination: wallet.address,
            customPayload: null,
            forwardTonAmount: toNano("0.1"),
            forwardPayload: beginCell().endCell(),
        };
        const transfer_result = await wallet_contract.send(deployer.getSender(), { value: toNano(1) }, TokenTransfer);
        expect(transfer_result.transactions).toHaveTransaction({
            from: deployer.address,
            to: wallet_contract.address,
        });
        console.log(transfer_result.events);
        // console.log(transfer_result.transactions);

        // let jetton_balance_of_new_player = await contract_token.getGetWalletAddress(new_player.address);
        // let new_wallet = blockchain.openContract(await JettonDefaultWallet.fromAddress(jetton_balance_of_new_player));
        // console.log("JettonWallet Address: " + new_wallet.address.toString());
        // console.log("JettonWallet Balance: " + (await new_wallet.getGetWalletData()).balance);
        // console.log("Jetoon Wallet Owner: " + (await new_wallet.getGetWalletData()).owner.toString());
    });
});
