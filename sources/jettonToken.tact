// import "@stdlib/jetton";

struct MasterData {
    total_supply: Int;
    mintable: Bool;
    admin: Address;
    jetton_content: Cell?;
    jetton_wallet_code: Cell;
}

// ---------------------------------------------------------------------------------------------------- //
message UploadContent {
    content: Cell;
}

message TokenMinting {
    collection_address: Address;
    original_applicant: Address;
}

message SafeTokenBurn {
    queryId: Int as uint64;
    amount: Int as coins;
    owner: Address;
    responseAddress: Address?;
}

message(0x7bdd97de) TokenBurnNotification {
    queryId: Int as uint64;
    amount: Int as coins;
    owner: Address;
    responseAddress: Address?;
}

contract Token {
    const minTonsForStorage: Int = ton("0.01");
    const gasConsumption: Int = ton("0.01");

    total_supply: Int as coins;
    mintable: Bool;

    admin: Address;
    collection_address: Address;
    content: Cell?;
    multiplier: Int as coins;

    init(admin: Address, collection_address: Address) {
        self.total_supply = 0;
        self.admin = admin;
        self.mintable = true;
        self.multiplier = 1000000000; // TODO
        self.collection_address = collection_address;
    }

    receive(msg: UploadContent) {
        let ctx: Context = context();
        require(ctx.sender == self.admin, "Only admin can upload content");
        self.content = msg.content;
        self.forward(
            self.admin,
            "Success".asComment(),
            false,
            null
        );
    }

    receive(msg: TokenMinting) {
        let ctx: Context = context();
        require(ctx.sender == self.collection_address, "Only admin can mint tokens");
        self.mint(msg.original_applicant, self.multiplier, self.admin);
    }

    receive(msg: TokenBurnNotification) {
        let ctx: Context = context();
        require(ctx.sender == self.getWalletAddress(msg.owner), "Only wallet can burn tokens");
        require(msg.amount == self.multiplier, "Invalid amount");
        require(self.total_supply - msg.amount >= 0, "Invalid total supply after burn");
        self.burn(msg.amount, msg.responseAddress!!, msg.queryId, msg.owner);
    }

    fun mint(to: Address, amount: Int, responseAddress: Address) {
        // Update total supply
        self.total_supply = self.total_supply + amount;

        // Create message
        let winit: StateInit = self.getJettonWalletInit(to);
        let walletAddress: Address = contractAddress(winit);
        send(SendParameters{
            to: walletAddress, 
            value: 0, 
            bounce: false,
            mode: SendRemainingValue,
            body: TokenTransferInternal{ 
                queryId: 0,
                amount: amount,
                from: self.collection_address,
                responseAddress: myAddress(),
                forward_ton_amount: 0,
                forward_payload: emptySlice()
            }.toCell(),
            code: winit.code,
            data: winit.data
        });
    }

    fun burn(burnAmount: Int, responseAddress: Address, queryId: Int, walletAddress: Address) {
        // Update total supply
        self.total_supply = self.total_supply - burnAmount;

        // Create message, return to the JettonWallet Address
        let winit: StateInit = self.getJettonWalletInit(responseAddress);
        send(SendParameters{
            to: contractAddress(winit),
            value: ton("0.0000001"),
            bounce: false,
            body: TokenExcesses{
                queryId: 0
            }.toCell()
        });

        // Send the message with the remaining value, and remind the Collection Contract that who is the owner
        // Send a confirmation back to the collection address
        self.forward(
            self.collection_address,
            Defractionalize{ sender: walletAddress }.toCell(),
            false,
            null
        );
    } 

    get fun getWalletAddress(owner: Address): Address {
        let winit: StateInit = self.getJettonWalletInit(owner);
        return contractAddress(winit);
    }

    get fun getJettonWalletInit(address: Address): StateInit {
        return initOf JettonDefaultWallet(myAddress(), address);
    }

    get fun get_jetton_data(): MasterData {
        return MasterData { 
            total_supply: self.total_supply, 
            mintable: self.mintable, 
            admin: self.admin, 
            jetton_content: self.content, 
            jetton_wallet_code: self.getJettonWalletInit(self.admin).code
        };
    }

}

contract JettonDefaultWallet {
    const minTonsForStorage: Int = ton("0.01");
    const gasConsumption: Int = ton("0.01");

    balance: Int;
    owner: Address;
    master: Address;

    init(master: Address, owner: Address) {
        self.balance = 0;
        self.owner = owner;
        self.master = master;
    }

    receive(msg: TokenTransfer) {

        // Check sender
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Invalid sender");

        // Update balance
        self.balance = self.balance - msg.amount;
        require(self.balance >= 0, "Invalid balance");

        // Gas checks
        let fwdFee: Int = ctx.readForwardFee();
        let fwdCount: Int = 1;
        if (msg.forward_ton_amount > 0) {
            fwdCount = 2;
        }
        require(ctx.value > fwdCount * fwdFee + 2 * self.gasConsumption + self.minTonsForStorage, "Invalid value");

        // Send tokens
        let init: StateInit = initOf JettonDefaultWallet(self.master, msg.destination);
        let walletAddress: Address = contractAddress(init);
        send(SendParameters{
            to: walletAddress, 
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors, 
            bounce: true,
            body: TokenTransferInternal{
                queryId: msg.queryId,
                amount: msg.amount,
                from: self.owner,
                responseAddress: myAddress(),
                forward_ton_amount: msg.forward_ton_amount,
                forward_payload: msg.forward_payload
            }.toCell(),
            code: init.code,
            data: init.data
        });
    }

    receive(msg: TokenTransferInternal) { // 0x178d4519
        // Check sender
        let ctx: Context = context();
        if (ctx.sender != self.master) {
            let sinit: StateInit = initOf JettonDefaultWallet(self.master, msg.from);
            require(contractAddress(sinit) == ctx.sender, "Invalid sender");
        }

        // Update balance
        self.balance = self.balance + msg.amount;
        require(self.balance >= 0, "Invalid balance");

        // Forward ton
        if (msg.forward_ton_amount > 0) {
            send(SendParameters{
                to: self.owner,
                value: msg.forward_ton_amount,
                bounce: false,
                body: TokenNotification{
                    queryId: msg.queryId,
                    amount: msg.amount,
                    from: msg.from,
                    forward_payload: msg.forward_payload
                }.toCell(),
                mode: SendIgnoreErrors
            });
        }

        let msgValue: Int = self.msgValue(ctx.value);  // Get value for gas
        let fwdFee: Int = ctx.readForwardFee();
        msgValue = msgValue - msg.forward_ton_amount - fwdFee;

        // Cashback
        if (msg.responseAddress != null) {
            send(SendParameters{
                to: msg.responseAddress,
                value: msgValue,
                mode: SendIgnoreErrors,
                bounce: false,
                body: TokenExcesses{
                    queryId: msg.queryId
                }.toCell()
            });
        }
    }

    get fun msgValue(value: Int): Int {
        let msgValue: Int = value;
        let tonBalanceBeforeMsg: Int = myBalance() - msgValue;
        let storageFee: Int = self.minTonsForStorage - min(tonBalanceBeforeMsg, self.minTonsForStorage);
        msgValue = msgValue - (storageFee + self.gasConsumption);
        return msgValue;
    }

    // This Burn msg only decrease balance of wallet, but not decrease total supply
    receive(msg: TokenBurn) {

        // Check sender
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Invalid sender");

        // Update balance
        self.balance = self.balance - msg.amount;
        require(self.balance >= 0, "Invalid balance");

        // Gas checks
        let fwdFee: Int = ctx.readForwardFee();
        require(ctx.value > fwdFee + 2 * self.gasConsumption + self.minTonsForStorage, "Invalid value");

        // Burn tokens
        send(SendParameters{
            to: self.master,
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            body: TokenBurnNotification{
                queryId: msg.queryId,
                amount: msg.amount,
                owner: self.owner,
                responseAddress: myAddress()
            }.toCell()
        });
    }


    bounced(msg: Slice) {
        msg.skipBits(32); // 0xFFFFFFFF
        let op: Int = msg.loadUint(32);
        let queryId: Int = msg.loadUint(64);
        let jettonAmount: Int = msg.loadCoins();
        require(op == 0x178d4519 || op == 0x7bdd97de, "Invalid bounced message");

        // Update balance
        self.balance = self.balance + jettonAmount;
    }

    get fun get_wallet_data(): JettonWalletData {
        return JettonWalletData{
            balance: self.balance,
            owner: self.owner,
            master: self.master,
            walletCode: (initOf JettonDefaultWallet(self.master, self.owner)).code
        };
    }
}


message(0xf8a7ea5) TokenTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forward_ton_amount: Int as coins;
    forward_payload: Slice as remaining;
}

message(0x178d4519) TokenTransferInternal {
    queryId: Int as uint64;
    amount: Int as coins;
    from: Address;
    responseAddress: Address;
    forward_ton_amount: Int as coins;
    forward_payload: Slice as remaining;
}

message(0x7362d09c) TokenNotification {
    queryId: Int as uint64;
    amount: Int as coins;
    from: Address;
    forward_payload: Slice as remaining;
}

message(0x595f07bc) TokenBurn {
    queryId: Int as uint64;
    amount: Int as coins;
    owner: Address;
    responseAddress: Address;
}



// message TokenBurnConfirmation {
//     queryId: Int as uint64;
//     amount: Int as coins;
// }



message(0xd53276db) TokenExcesses {
    queryId: Int as uint64;
}

message TokenUpdateContent {
    content: Cell?;
}

struct JettonWalletData {
    balance: Int;
    owner: Address;
    master: Address;
    walletCode: Cell;
}