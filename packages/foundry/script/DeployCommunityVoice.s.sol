//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/CommunityVoice.sol";

contract DeployCommunityVoice is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        // CLAWD token on Base
        address clawdToken = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

        CommunityVoice communityVoice = new CommunityVoice(clawdToken);
        console.logString(
            string.concat("CommunityVoice deployed at: ", vm.toString(address(communityVoice)))
        );
    }
}
