// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {HedwigPayment} from "../src/HedwigPayment.sol";

/**
 * @title HedwigPayment Tests
 * @dev Basic tests for the HedwigPayment contract
 */
contract HedwigPaymentTest is Test {
    HedwigPayment public payment;
    address public platformWallet = address(0x1);
    address public freelancer = address(0x2);
    address public payer = address(0x3);
    
    function setUp() public {
        payment = new HedwigPayment(platformWallet);
    }
    
    function testDeployment() public view {
        assertEq(payment.PLATFORM_WALLET(), platformWallet);
        assertEq(payment.OWNER(), address(this));
        assertEq(payment.PLATFORM_FEE(), 100); // 1%
    }
    
    function testVersion() public view {
        assertEq(payment.version(), "3.0.0");
    }
    
    function testInvalidPlatformWallet() public {
        vm.expectRevert(HedwigPayment.InvalidAddress.selector);
        new HedwigPayment(address(0));
    }
    
    function testPaymentValidation() public {
        vm.startPrank(payer);
        
        // Test zero amount
        vm.expectRevert(HedwigPayment.InvalidAmount.selector);
        payment.pay(0, freelancer, "test");
        
        // Test zero freelancer address
        vm.expectRevert(HedwigPayment.InvalidAddress.selector);
        payment.pay(1000, address(0), "test");
        
        vm.stopPrank();
    }
}
