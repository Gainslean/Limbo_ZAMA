// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CustomERC20.sol";

contract LimboMain {
    CustomERC20 public immutable LETH;
    CustomERC20 public immutable LUSDT;

    uint256 public constant APR_BPS = 500; // 5.00%
    uint256 public constant BPS = 10000;
    uint256 public constant YEAR = 365 days;

    uint256 public constant PRICE = 5000 ether; // 1 LETH = 5000 LUSDT
    uint256 public constant LTV_BPS = 7500;     // 75%

    struct Debt { uint256 principal; uint64 lastAccrued; }
    mapping(address => Debt) public debts;

    event Deposit(address indexed user, uint256 ethAmount, uint256 lethMint);
    event Withdraw(address indexed user, uint256 lethBurn, uint256 ethOut);
    event Borrow(address indexed user, uint256 lusdtOut);
    event Repay(address indexed user, uint256 lusdtIn);

    constructor(address _leth, address _lusdt) {
        LETH  = CustomERC20(_leth);
        LUSDT = CustomERC20(_lusdt);
    }

    function _accrued(uint256 principal, uint256 fromTs) internal view returns (uint256) {
        if (principal == 0) return 0;
        uint256 dt = block.timestamp - fromTs;
        return principal * APR_BPS * dt / BPS / YEAR;
    }

    function _currentDebtOf(address u) internal view returns (uint256) {
        Debt memory d = debts[u];
        if (d.principal == 0) return 0;
        return d.principal + _accrued(d.principal, d.lastAccrued);
    }

    function getCurrentDebt(address u) external view returns (uint256) {
        return _currentDebtOf(u);
    }

    function _requiredCollateral(uint256 debt) internal pure returns (uint256) {
        uint256 ethAt100 = (debt * 1e18) / PRICE;
        return (ethAt100 * BPS) / LTV_BPS;
    }

    function getAvailableToBorrow(address u) external view returns (uint256) {
        uint256 coll = LETH.balanceOf(u);
        uint256 debt = _currentDebtOf(u);
        uint256 req  = _requiredCollateral(debt);
        if (coll <= req) return 0;
        uint256 freeETH = coll - req;
        return (freeETH * PRICE) / 1e18;
    }

    function getAvailableToWithdraw(address u) external view returns (uint256) {
        uint256 coll = LETH.balanceOf(u);
        uint256 debt = _currentDebtOf(u);
        uint256 req  = _requiredCollateral(debt);
        if (coll <= req) return 0;
        return coll - req;
    }

    function deposit() external payable {
        require(msg.value > 0, "ZERO_VALUE");
        LETH.mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(amount > 0, "ZERO_AMOUNT");
        uint256 coll = LETH.balanceOf(msg.sender);
        require(coll >= amount, "INSUFFICIENT_LETH");

        uint256 debt = _currentDebtOf(msg.sender);
        uint256 reqAfter = _requiredCollateral(debt);
        require(coll - amount >= reqAfter, "INSUFFICIENT_COLLATERAL");

        LETH.burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "ETH_SEND_FAIL");
        emit Withdraw(msg.sender, amount, amount);
    }

    function borrow(uint256 lusdtAmount) external {
        require(lusdtAmount > 0, "ZERO_AMOUNT");
        Debt storage d = debts[msg.sender];
        uint256 curr = _currentDebtOf(msg.sender);
        d.principal = curr + lusdtAmount;
        d.lastAccrued = uint64(block.timestamp);

        uint256 coll = LETH.balanceOf(msg.sender);
        uint256 req  = _requiredCollateral(d.principal);
        require(coll >= req, "INSUFFICIENT_COLLATERAL");

        LUSDT.mint(msg.sender, lusdtAmount);
        emit Borrow(msg.sender, lusdtAmount);
    }

    function repay(uint256 lusdtAmount) external {
        require(lusdtAmount > 0, "ZERO_AMOUNT");
        Debt storage d = debts[msg.sender];
        uint256 curr = _currentDebtOf(msg.sender);

        bool ok = LUSDT.transferFrom(msg.sender, address(this), lusdtAmount);
        require(ok, "TRANSFER_FAIL");

        uint256 newDebt = curr > lusdtAmount ? curr - lusdtAmount : 0;
        d.principal = newDebt;
        d.lastAccrued = uint64(block.timestamp);

        LUSDT.burn(address(this), lusdtAmount);
        emit Repay(msg.sender, lusdtAmount);
    }

    receive() external payable {}
}
