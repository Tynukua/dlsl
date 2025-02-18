const { assert } = require("chai");
const { toBN, accounts } = require("../../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const CRDependant = artifacts.require("CRDependant");
const CRDependantUpgrade = artifacts.require("CRDependantUpgrade");
const ERC20Mock = artifacts.require("ERC20Mock");

ContractsRegistry.numberFormat = "BigNumber";
CRDependant.numberFormat = "BigNumber";
CRDependantUpgrade.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

describe("ContractsRegistry", () => {
  let ZERO = "0x0000000000000000000000000000000000000000";
  let OWNER;

  let contractsRegistry;

  before("setup", async () => {
    OWNER = await accounts(0);
  });

  beforeEach("setup", async () => {
    contractsRegistry = await ContractsRegistry.new();

    await contractsRegistry.__ContractsRegistry_init();
  });

  describe("contract management", async () => {
    it("should fail adding zero address", async () => {
      await truffleAssert.reverts(
        contractsRegistry.addContract(await contractsRegistry.CRDEPENDANT_NAME(), ZERO),
        "ContractsRegistry: Null address is forbidden"
      );

      await truffleAssert.reverts(
        contractsRegistry.addProxyContract(await contractsRegistry.CRDEPENDANT_NAME(), ZERO),
        "ContractsRegistry: Null address is forbidden"
      );

      await truffleAssert.reverts(
        contractsRegistry.justAddProxyContract(await contractsRegistry.CRDEPENDANT_NAME(), ZERO),
        "ContractsRegistry: Null address is forbidden"
      );
    });

    it("should add and remove the contract", async () => {
      const crd = await CRDependant.new();

      await truffleAssert.reverts(
        contractsRegistry.removeContract(await contractsRegistry.CRDEPENDANT_NAME()),
        "ContractsRegistry: This mapping doesn't exist"
      );

      await contractsRegistry.addContract(await contractsRegistry.CRDEPENDANT_NAME(), crd.address);

      assert.equal(await contractsRegistry.getCRDependantContract(), crd.address);
      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.CRDEPENDANT_NAME()));

      await contractsRegistry.removeContract(await contractsRegistry.CRDEPENDANT_NAME());

      await truffleAssert.reverts(
        contractsRegistry.getCRDependantContract(),
        "ContractsRegistry: This mapping doesn't exist"
      );
      assert.isFalse(await contractsRegistry.hasContract(await contractsRegistry.CRDEPENDANT_NAME()));
    });

    it("should add and remove the proxy contract", async () => {
      const _crd = await CRDependant.new();

      await contractsRegistry.addProxyContract(await contractsRegistry.CRDEPENDANT_NAME(), _crd.address);

      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.CRDEPENDANT_NAME()));

      await contractsRegistry.removeContract(await contractsRegistry.CRDEPENDANT_NAME());

      assert.isFalse(await contractsRegistry.hasContract(await contractsRegistry.CRDEPENDANT_NAME()));
    });

    it("should just add and remove the proxy contract", async () => {
      const _crd = await CRDependant.new();

      await contractsRegistry.addProxyContract(await contractsRegistry.CRDEPENDANT_NAME(), _crd.address);

      const crd = await contractsRegistry.getCRDependantContract();

      await contractsRegistry.removeContract(await contractsRegistry.CRDEPENDANT_NAME());

      await contractsRegistry.justAddProxyContract(await contractsRegistry.CRDEPENDANT_NAME(), _crd.address);

      assert.isTrue(await contractsRegistry.hasContract(await contractsRegistry.CRDEPENDANT_NAME()));

      await contractsRegistry.removeContract(await contractsRegistry.CRDEPENDANT_NAME());

      assert.isFalse(await contractsRegistry.hasContract(await contractsRegistry.CRDEPENDANT_NAME()));
    });
  });

  describe("contract upgrades", () => {
    let _crd;
    let _crdu;

    let crd;

    beforeEach("setup", async () => {
      _crd = await CRDependant.new();
      _crdu = await CRDependantUpgrade.new();

      await contractsRegistry.addProxyContract(await contractsRegistry.CRDEPENDANT_NAME(), _crd.address);

      crd = await CRDependantUpgrade.at(await contractsRegistry.getCRDependantContract());
    });

    it("should not upgrade non-proxy contract", async () => {
      const crd = await CRDependant.new();

      await contractsRegistry.addContract(await contractsRegistry.CRDEPENDANT_NAME(), crd.address);

      await truffleAssert.reverts(
        contractsRegistry.getImplementation(await contractsRegistry.CRDEPENDANT_NAME()),
        "ContractsRegistry: Not a proxy contract"
      );

      await truffleAssert.reverts(
        contractsRegistry.upgradeContract(await contractsRegistry.CRDEPENDANT_NAME(), _crdu.address),
        "ContractsRegistry: Not a proxy contract"
      );
    });

    it("should upgrade the contract", async () => {
      await truffleAssert.reverts(crd.addedFunction());

      await truffleAssert.passes(contractsRegistry.getProxyUpgrader());

      assert.equal(await contractsRegistry.getImplementation(await contractsRegistry.CRDEPENDANT_NAME()), _crd.address);

      await contractsRegistry.upgradeContract(await contractsRegistry.CRDEPENDANT_NAME(), _crdu.address);

      assert.equal(
        await contractsRegistry.getImplementation(await contractsRegistry.CRDEPENDANT_NAME()),
        _crdu.address
      );

      assert.equal(toBN(await crd.addedFunction()).toFixed(), "42");
    });

    it("should upgrade and call the contract", async () => {
      await truffleAssert.reverts(crd.addedFunction());

      let data = web3.eth.abi.encodeFunctionCall(
        {
          name: "doUpgrade",
          inputs: [
            {
              type: "uint256",
              name: "value",
            },
          ],
        },
        ["42"]
      );

      await contractsRegistry.upgradeContractAndCall(await contractsRegistry.CRDEPENDANT_NAME(), _crdu.address, data);

      assert.equal(toBN(await crd.dummyValue()).toFixed(), "42");
    });
  });

  describe("dependency injection", () => {
    let crd;
    let token;

    beforeEach("setup", async () => {
      const _crd = await CRDependant.new();
      token = await ERC20Mock.new("Mock", "Mock", 18);

      await contractsRegistry.addProxyContract(await contractsRegistry.CRDEPENDANT_NAME(), _crd.address);

      await contractsRegistry.addContract(await contractsRegistry.TOKEN_NAME(), token.address);

      crd = await CRDependantUpgrade.at(await contractsRegistry.getCRDependantContract());
    });

    it("should inject dependencies", async () => {
      assert.equal(await crd.token(), ZERO);

      await contractsRegistry.injectDependencies(await contractsRegistry.CRDEPENDANT_NAME());

      assert.equal(await crd.token(), token.address);
    });

    it("should not allow random users to inject dependencies", async () => {
      await contractsRegistry.injectDependencies(await contractsRegistry.CRDEPENDANT_NAME());

      assert.equal(await crd.getInjector(), contractsRegistry.address);

      await truffleAssert.reverts(crd.setDependencies(contractsRegistry.address), "Dependant: Not an injector");
    });

    it("should not allow random users to set new injector", async () => {
      await contractsRegistry.injectDependencies(await contractsRegistry.CRDEPENDANT_NAME());

      await truffleAssert.reverts(crd.setInjector(OWNER), "Dependant: Not an injector");
    });
  });
});
