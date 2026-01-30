// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CommunityVoice
 * @notice A community voting/signaling contract where token holders stake tokens
 *         on proposals to signal what should be built next.
 *         Staking is reversible — users can unstake anytime.
 *         Admin creates/closes proposals. No time limits.
 */
contract CommunityVoice is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;

    struct Proposal {
        string title;
        string description;
        uint256 totalStaked;
        bool active;
        uint256 createdAt;
    }

    // All proposals
    Proposal[] public proposals;

    // proposalId => user => staked amount
    mapping(uint256 => mapping(address => uint256)) public userStake;

    // Events
    event ProposalCreated(uint256 indexed proposalId, string title, string description);
    event ProposalClosed(uint256 indexed proposalId);
    event ProposalReopened(uint256 indexed proposalId);
    event Staked(uint256 indexed proposalId, address indexed user, uint256 amount);
    event Unstaked(uint256 indexed proposalId, address indexed user, uint256 amount);

    constructor(address _stakingToken) Ownable(msg.sender) {
        require(_stakingToken != address(0), "Invalid token");
        stakingToken = IERC20(_stakingToken);
    }

    // ============ Admin Functions ============

    /**
     * @notice Create a new proposal (admin only)
     */
    function createProposal(string calldata _title, string calldata _description) external onlyOwner {
        proposals.push(Proposal({
            title: _title,
            description: _description,
            totalStaked: 0,
            active: true,
            createdAt: block.timestamp
        }));
        emit ProposalCreated(proposals.length - 1, _title, _description);
    }

    /**
     * @notice Close a proposal (admin only). Users can still unstake.
     */
    function closeProposal(uint256 _proposalId) external onlyOwner {
        require(_proposalId < proposals.length, "Invalid proposal");
        require(proposals[_proposalId].active, "Already closed");
        proposals[_proposalId].active = false;
        emit ProposalClosed(_proposalId);
    }

    /**
     * @notice Reopen a closed proposal (admin only)
     */
    function reopenProposal(uint256 _proposalId) external onlyOwner {
        require(_proposalId < proposals.length, "Invalid proposal");
        require(!proposals[_proposalId].active, "Already active");
        proposals[_proposalId].active = true;
        emit ProposalReopened(_proposalId);
    }

    // ============ User Functions ============

    /**
     * @notice Stake tokens on a proposal. User must approve this contract first.
     * @param _proposalId The proposal to stake on
     * @param _amount Amount of tokens to stake (in wei)
     */
    function stake(uint256 _proposalId, uint256 _amount) external nonReentrant {
        require(_proposalId < proposals.length, "Invalid proposal");
        require(proposals[_proposalId].active, "Proposal closed");
        require(_amount > 0, "Amount must be > 0");

        // Pull tokens from user (requires prior approval)
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);

        userStake[_proposalId][msg.sender] += _amount;
        proposals[_proposalId].totalStaked += _amount;

        emit Staked(_proposalId, msg.sender, _amount);
    }

    /**
     * @notice Unstake tokens from a proposal. Can unstake even if proposal is closed.
     * @param _proposalId The proposal to unstake from
     * @param _amount Amount of tokens to unstake (in wei)
     */
    function unstake(uint256 _proposalId, uint256 _amount) external nonReentrant {
        require(_proposalId < proposals.length, "Invalid proposal");
        require(_amount > 0, "Amount must be > 0");
        require(userStake[_proposalId][msg.sender] >= _amount, "Insufficient stake");

        userStake[_proposalId][msg.sender] -= _amount;
        proposals[_proposalId].totalStaked -= _amount;

        // Return tokens to user
        stakingToken.safeTransfer(msg.sender, _amount);

        emit Unstaked(_proposalId, msg.sender, _amount);
    }

    // ============ View Functions ============

    /**
     * @notice Get total number of proposals
     */
    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    /**
     * @notice Get a proposal's details
     */
    function getProposal(uint256 _proposalId) external view returns (
        string memory title,
        string memory description,
        uint256 totalStaked,
        bool active,
        uint256 createdAt
    ) {
        require(_proposalId < proposals.length, "Invalid proposal");
        Proposal storage p = proposals[_proposalId];
        return (p.title, p.description, p.totalStaked, p.active, p.createdAt);
    }

    /**
     * @notice Get all proposals in one call (for the frontend leaderboard)
     */
    function getAllProposals() external view returns (Proposal[] memory) {
        return proposals;
    }

    /**
     * @notice Get user's stake on a specific proposal
     */
    function getUserStake(uint256 _proposalId, address _user) external view returns (uint256) {
        return userStake[_proposalId][_user];
    }
}
