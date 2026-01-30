// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/CommunityVoice.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock CLAWD", "CLAWD") {
        _mint(msg.sender, 1_000_000_000 ether);
    }
}

contract CommunityVoiceTest is Test {
    CommunityVoice public voice;
    MockToken public token;
    address public admin;
    address public alice;
    address public bob;

    function setUp() public {
        admin = address(this);
        alice = makeAddr("alice");
        bob = makeAddr("bob");

        token = new MockToken();
        voice = new CommunityVoice(address(token));

        // Give users tokens
        token.transfer(alice, 100_000 ether);
        token.transfer(bob, 100_000 ether);
    }

    // ============ Admin Functions ============

    function testCreateProposal() public {
        voice.createProposal("Build Chat", "Token-gated chat for CLAWD holders");
        assertEq(voice.proposalCount(), 1);

        (string memory title, string memory desc, uint256 staked, bool active,) = voice.getProposal(0);
        assertEq(title, "Build Chat");
        assertEq(desc, "Token-gated chat for CLAWD holders");
        assertEq(staked, 0);
        assertTrue(active);
    }

    function testOnlyOwnerCanCreateProposal() public {
        vm.prank(alice);
        vm.expectRevert();
        voice.createProposal("Rogue Proposal", "Should fail");
    }

    function testCloseProposal() public {
        voice.createProposal("Build Chat", "Description");
        voice.closeProposal(0);

        (,,, bool active,) = voice.getProposal(0);
        assertFalse(active);
    }

    function testReopenProposal() public {
        voice.createProposal("Build Chat", "Description");
        voice.closeProposal(0);
        voice.reopenProposal(0);

        (,,, bool active,) = voice.getProposal(0);
        assertTrue(active);
    }

    // ============ Staking ============

    function testStake() public {
        voice.createProposal("Build Chat", "Description");

        vm.startPrank(alice);
        token.approve(address(voice), 1000 ether);
        voice.stake(0, 1000 ether);
        vm.stopPrank();

        assertEq(voice.getUserStake(0, alice), 1000 ether);
        (,, uint256 totalStaked,,) = voice.getProposal(0);
        assertEq(totalStaked, 1000 ether);
    }

    function testStakeMultipleUsers() public {
        voice.createProposal("Build Chat", "Description");

        vm.startPrank(alice);
        token.approve(address(voice), 500 ether);
        voice.stake(0, 500 ether);
        vm.stopPrank();

        vm.startPrank(bob);
        token.approve(address(voice), 300 ether);
        voice.stake(0, 300 ether);
        vm.stopPrank();

        (,, uint256 totalStaked,,) = voice.getProposal(0);
        assertEq(totalStaked, 800 ether);
    }

    function testCannotStakeOnClosedProposal() public {
        voice.createProposal("Build Chat", "Description");
        voice.closeProposal(0);

        vm.startPrank(alice);
        token.approve(address(voice), 100 ether);
        vm.expectRevert("Proposal closed");
        voice.stake(0, 100 ether);
        vm.stopPrank();
    }

    function testCannotStakeZero() public {
        voice.createProposal("Build Chat", "Description");

        vm.startPrank(alice);
        vm.expectRevert("Amount must be > 0");
        voice.stake(0, 0);
        vm.stopPrank();
    }

    // ============ Unstaking ============

    function testUnstake() public {
        voice.createProposal("Build Chat", "Description");

        vm.startPrank(alice);
        token.approve(address(voice), 1000 ether);
        voice.stake(0, 1000 ether);

        uint256 balBefore = token.balanceOf(alice);
        voice.unstake(0, 500 ether);
        uint256 balAfter = token.balanceOf(alice);
        vm.stopPrank();

        assertEq(balAfter - balBefore, 500 ether);
        assertEq(voice.getUserStake(0, alice), 500 ether);
    }

    function testUnstakeFromClosedProposal() public {
        voice.createProposal("Build Chat", "Description");

        vm.startPrank(alice);
        token.approve(address(voice), 1000 ether);
        voice.stake(0, 1000 ether);
        vm.stopPrank();

        // Admin closes proposal
        voice.closeProposal(0);

        // Alice can still unstake
        vm.startPrank(alice);
        voice.unstake(0, 1000 ether);
        vm.stopPrank();

        assertEq(voice.getUserStake(0, alice), 0);
    }

    function testCannotUnstakeMoreThanStaked() public {
        voice.createProposal("Build Chat", "Description");

        vm.startPrank(alice);
        token.approve(address(voice), 100 ether);
        voice.stake(0, 100 ether);
        vm.expectRevert("Insufficient stake");
        voice.unstake(0, 200 ether);
        vm.stopPrank();
    }

    // ============ View Functions ============

    function testGetAllProposals() public {
        voice.createProposal("Proposal 1", "Desc 1");
        voice.createProposal("Proposal 2", "Desc 2");
        voice.createProposal("Proposal 3", "Desc 3");

        CommunityVoice.Proposal[] memory all = voice.getAllProposals();
        assertEq(all.length, 3);
        assertEq(all[0].title, "Proposal 1");
        assertEq(all[2].title, "Proposal 3");
    }
}
