//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import { DeployCommunityVoice } from "./DeployCommunityVoice.s.sol";

contract DeployScript is ScaffoldETHDeploy {
  function run() external {
    DeployCommunityVoice deployCommunityVoice = new DeployCommunityVoice();
    deployCommunityVoice.run();
  }
}
