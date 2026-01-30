"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { Address } from "@scaffold-ui/components";
import { formatUnits, parseUnits } from "viem";
import { notification } from "~~/utils/scaffold-eth";
import type { NextPage } from "next";

// CLAWD token address on Base
const CLAWD_TOKEN = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";

// ERC20 ABI fragments we need
const ERC20_ABI = [
  {
    type: "function" as const,
    name: "balanceOf",
    stateMutability: "view" as const,
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function" as const,
    name: "allowance",
    stateMutability: "view" as const,
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function" as const,
    name: "approve",
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

interface Proposal {
  title: string;
  description: string;
  totalStaked: bigint;
  active: boolean;
  createdAt: bigint;
}

// ============ Helper: Format CLAWD amounts ============
function formatClawd(amount: bigint): string {
  const num = parseFloat(formatUnits(amount, 18));
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

function formatClawdFull(amount: bigint): string {
  return parseFloat(formatUnits(amount, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ============ Proposal Card Component ============
function ProposalCard({
  proposal,
  proposalId,
  rank,
  contractAddress,
  clawdPrice,
  refetchAllProposals,
  isAdmin,
}: {
  proposal: Proposal;
  proposalId: number;
  rank: number;
  contractAddress: string | undefined;
  clawdPrice: number;
  refetchAllProposals: () => void;
  isAdmin: boolean;
}) {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [isUnstaking, setIsUnstaking] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();

  // Read user's stake on this proposal
  const { data: userStake, refetch: refetchUserStake } = useScaffoldReadContract({
    contractName: "CommunityVoice",
    functionName: "getUserStake",
    args: [BigInt(proposalId), address],
  });

  // Read user's allowance for this contract
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CLAWD_TOKEN,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && contractAddress ? [address, contractAddress as `0x${string}`] : undefined,
  });

  // Wait for approve tx confirmation
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });

  useEffect(() => {
    if (approveConfirmed) {
      refetchAllowance();
      setApproveTxHash(undefined);
    }
  }, [approveConfirmed, refetchAllowance]);

  // Write contracts
  const { writeContractAsync: writeApprove } = useWriteContract();
  const { writeContractAsync: writeStake } = useScaffoldWriteContract("CommunityVoice");
  const { writeContractAsync: writeUnstake } = useScaffoldWriteContract("CommunityVoice");
  const { writeContractAsync: writeClose } = useScaffoldWriteContract("CommunityVoice");
  const { writeContractAsync: writeReopen } = useScaffoldWriteContract("CommunityVoice");

  const parsedStakeAmount = stakeAmount ? parseUnits(stakeAmount, 18) : 0n;
  const parsedUnstakeAmount = unstakeAmount ? parseUnits(unstakeAmount, 18) : 0n;
  const needsApproval = parsedStakeAmount > 0n && (!allowance || allowance < parsedStakeAmount);

  const handleApprove = async () => {
    if (!contractAddress || parsedStakeAmount === 0n) return;
    setIsApproving(true);
    try {
      // Approve exact amount + 1% buffer (NOT unlimited!)
      const approveAmount = parsedStakeAmount + (parsedStakeAmount / 100n);
      const hash = await writeApprove({
        address: CLAWD_TOKEN,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [contractAddress as `0x${string}`, approveAmount],
      });
      setApproveTxHash(hash);
      notification.success("Approval submitted!");
    } catch (e) {
      console.error(e);
      notification.error("Approval failed");
    } finally {
      setIsApproving(false);
    }
  };

  const handleStake = async () => {
    if (parsedStakeAmount === 0n) return;
    setIsStaking(true);
    try {
      await writeStake({
        functionName: "stake",
        args: [BigInt(proposalId), parsedStakeAmount],
      });
      notification.success(`Staked ${stakeAmount} CLAWD!`);
      setStakeAmount("");
      refetchUserStake();
      refetchAllowance();
      refetchAllProposals();
    } catch (e) {
      console.error(e);
      notification.error("Staking failed");
    } finally {
      setIsStaking(false);
    }
  };

  const handleUnstake = async () => {
    if (parsedUnstakeAmount === 0n) return;
    setIsUnstaking(true);
    try {
      await writeUnstake({
        functionName: "unstake",
        args: [BigInt(proposalId), parsedUnstakeAmount],
      });
      notification.success(`Unstaked ${unstakeAmount} CLAWD!`);
      setUnstakeAmount("");
      refetchUserStake();
      refetchAllProposals();
    } catch (e) {
      console.error(e);
      notification.error("Unstaking failed");
    } finally {
      setIsUnstaking(false);
    }
  };

  const handleClose = async () => {
    setIsClosing(true);
    try {
      await writeClose({ functionName: "closeProposal", args: [BigInt(proposalId)] });
      notification.success("Proposal closed");
      refetchAllProposals();
    } catch (e) {
      console.error(e);
      notification.error("Close failed");
    } finally {
      setIsClosing(false);
    }
  };

  const handleReopen = async () => {
    setIsReopening(true);
    try {
      await writeReopen({ functionName: "reopenProposal", args: [BigInt(proposalId)] });
      notification.success("Proposal reopened");
      refetchAllProposals();
    } catch (e) {
      console.error(e);
      notification.error("Reopen failed");
    } finally {
      setIsReopening(false);
    }
  };

  const totalStakedUsd = parseFloat(formatUnits(proposal.totalStaked, 18)) * clawdPrice;
  const userStakeUsd = userStake ? parseFloat(formatUnits(userStake, 18)) * clawdPrice : 0;
  const stakeAmountUsd = stakeAmount ? parseFloat(stakeAmount) * clawdPrice : 0;
  const unstakeAmountUsd = unstakeAmount ? parseFloat(unstakeAmount) * clawdPrice : 0;

  const rankColors = ["text-yellow-400", "text-gray-400", "text-amber-600"];
  const rankEmojis = ["🥇", "🥈", "🥉"];

  return (
    <div className={`card bg-base-100 shadow-xl border ${proposal.active ? "border-base-300" : "border-error/30 opacity-75"}`}>
      <div className="card-body p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${rankColors[rank] || "text-base-content/50"}`}>
              {rank < 3 ? rankEmojis[rank] : `#${rank + 1}`}
            </span>
            <div>
              <h2 className="card-title text-lg">{proposal.title}</h2>
              {!proposal.active && (
                <span className="badge badge-error badge-sm">Closed</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-primary">{formatClawd(proposal.totalStaked)}</div>
            <div className="text-xs text-base-content/60">
              CLAWD staked{totalStakedUsd > 0.01 ? ` (~$${totalStakedUsd.toFixed(2)})` : ""}
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-base-content/70 mt-1">{proposal.description}</p>

        {/* User's stake */}
        {address && userStake && userStake > 0n && (
          <div className="bg-primary/10 rounded-lg p-3 mt-2">
            <div className="text-sm font-semibold">
              Your stake: {formatClawdFull(userStake)} CLAWD
              {userStakeUsd > 0.01 ? ` (~$${userStakeUsd.toFixed(2)})` : ""}
            </div>
          </div>
        )}

        {/* Actions */}
        {address && (
          <div className="mt-3 space-y-3">
            {/* Stake section */}
            {proposal.active && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs text-base-content/60 mb-1 block">Stake CLAWD</label>
                  <input
                    type="number"
                    placeholder="Amount"
                    className="input input-bordered input-sm w-full"
                    value={stakeAmount}
                    onChange={e => setStakeAmount(e.target.value)}
                    min="0"
                  />
                  {stakeAmountUsd > 0.01 && (
                    <span className="text-xs text-base-content/50">≈ ${stakeAmountUsd.toFixed(2)} USD</span>
                  )}
                </div>
                {needsApproval ? (
                  <button
                    className="btn btn-warning btn-sm"
                    disabled={isApproving || parsedStakeAmount === 0n}
                    onClick={handleApprove}
                  >
                    {isApproving ? (
                      <span className="loading loading-spinner loading-xs"></span>
                    ) : null}
                    {isApproving ? "Approving..." : "Approve"}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={isStaking || parsedStakeAmount === 0n}
                    onClick={handleStake}
                  >
                    {isStaking ? (
                      <span className="loading loading-spinner loading-xs"></span>
                    ) : null}
                    {isStaking ? "Staking..." : "Stake"}
                  </button>
                )}
              </div>
            )}

            {/* Unstake section — always available */}
            {userStake && userStake > 0n && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs text-base-content/60 mb-1 block">Unstake CLAWD</label>
                  <input
                    type="number"
                    placeholder="Amount"
                    className="input input-bordered input-sm w-full"
                    value={unstakeAmount}
                    onChange={e => setUnstakeAmount(e.target.value)}
                    min="0"
                  />
                  {unstakeAmountUsd > 0.01 && (
                    <span className="text-xs text-base-content/50">≈ ${unstakeAmountUsd.toFixed(2)} USD</span>
                  )}
                  <button
                    className="text-xs text-primary/70 hover:text-primary ml-1 cursor-pointer"
                    onClick={() => setUnstakeAmount(formatUnits(userStake, 18))}
                  >
                    Max
                  </button>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={isUnstaking || parsedUnstakeAmount === 0n}
                  onClick={handleUnstake}
                >
                  {isUnstaking ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : null}
                  {isUnstaking ? "Unstaking..." : "Unstake"}
                </button>
              </div>
            )}

            {/* Admin controls */}
            {isAdmin && (
              <div className="flex gap-2 pt-2 border-t border-base-300">
                {proposal.active ? (
                  <button
                    className="btn btn-error btn-xs btn-outline"
                    disabled={isClosing}
                    onClick={handleClose}
                  >
                    {isClosing ? "Closing..." : "Close Proposal"}
                  </button>
                ) : (
                  <button
                    className="btn btn-success btn-xs btn-outline"
                    disabled={isReopening}
                    onClick={handleReopen}
                  >
                    {isReopening ? "Reopening..." : "Reopen Proposal"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Admin: Create Proposal Component ============
function CreateProposal({ refetchAllProposals }: { refetchAllProposals: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { writeContractAsync } = useScaffoldWriteContract("CommunityVoice");

  const handleCreate = async () => {
    if (!title.trim() || !description.trim()) return;
    setIsCreating(true);
    try {
      await writeContractAsync({
        functionName: "createProposal",
        args: [title, description],
      });
      notification.success("Proposal created!");
      setTitle("");
      setDescription("");
      refetchAllProposals();
    } catch (e) {
      console.error(e);
      notification.error("Failed to create proposal");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl border border-primary/30">
      <div className="card-body p-5">
        <h3 className="card-title text-sm">➕ Create New Proposal</h3>
        <input
          type="text"
          placeholder="Proposal title"
          className="input input-bordered input-sm w-full"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={100}
        />
        <textarea
          placeholder="Description — what should be built?"
          className="textarea textarea-bordered textarea-sm w-full"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={isCreating || !title.trim() || !description.trim()}
          onClick={handleCreate}
        >
          {isCreating ? (
            <span className="loading loading-spinner loading-xs"></span>
          ) : null}
          {isCreating ? "Creating..." : "Create Proposal"}
        </button>
      </div>
    </div>
  );
}

// ============ Main Page ============
const Home: NextPage = () => {
  const { address } = useAccount();
  const [clawdPrice, setClawdPrice] = useState(0);
  const [showClosed, setShowClosed] = useState(false);

  // Read contract owner
  const { data: owner } = useScaffoldReadContract({
    contractName: "CommunityVoice",
    functionName: "owner",
  });

  // Read all proposals
  const { data: allProposals, refetch: refetchAllProposals } = useScaffoldReadContract({
    contractName: "CommunityVoice",
    functionName: "getAllProposals",
  });

  // Read user's CLAWD balance
  const { data: clawdBalance } = useReadContract({
    address: CLAWD_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const isAdmin = address && owner && address.toLowerCase() === owner.toLowerCase();

  // Get CommunityVoice contract address for allowance checks
  // We'll extract it from the hook system
  const [contractAddress, setContractAddress] = useState<string | undefined>();

  // Fetch contract address from deployed contract info
  useEffect(() => {
    // The contract address is available through the deploy artifacts
    // We use a workaround: read the stakingToken to confirm contract exists
    // and get its address from the deployedContracts
    async function getAddr() {
      try {
        const deployedContracts = (await import("~~/contracts/deployedContracts")).default;
        const chainId = Object.keys(deployedContracts)[0];
        if (chainId) {
          const contracts = (deployedContracts as any)[chainId];
          if (contracts?.CommunityVoice?.address) {
            setContractAddress(contracts.CommunityVoice.address);
          }
        }
      } catch (e) {
        console.error("Could not load contract address", e);
      }
    }
    getAddr();
  }, []);

  // Fetch CLAWD price from DexScreener
  useEffect(() => {
    async function fetchPrice() {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${CLAWD_TOKEN}`
        );
        const data = await res.json();
        if (data.pairs && data.pairs.length > 0) {
          setClawdPrice(parseFloat(data.pairs[0].priceUsd || "0"));
        }
      } catch (e) {
        console.error("Price fetch failed:", e);
      }
    }
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Sort proposals by totalStaked descending for leaderboard
  const sortedProposals = allProposals
    ? [...(allProposals as Proposal[])].map((p, i) => ({ ...p, originalIndex: i }))
        .filter(p => showClosed || p.active)
        .sort((a, b) => (Number(b.totalStaked) - Number(a.totalStaked)))
    : [];

  const totalStakedAll = allProposals
    ? (allProposals as Proposal[]).reduce((sum, p) => sum + p.totalStaked, 0n)
    : 0n;

  const activeCount = allProposals
    ? (allProposals as Proposal[]).filter(p => p.active).length
    : 0;

  const balanceUsd = clawdBalance ? parseFloat(formatUnits(clawdBalance, 18)) * clawdPrice : 0;
  const totalStakedUsd = parseFloat(formatUnits(totalStakedAll, 18)) * clawdPrice;

  return (
    <div className="flex flex-col items-center px-4 py-6 max-w-4xl mx-auto w-full">
      {/* Stats bar */}
      <div className="stats stats-vertical sm:stats-horizontal shadow w-full mb-6">
        <div className="stat">
          <div className="stat-title">Active Proposals</div>
          <div className="stat-value text-primary">{activeCount}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Total CLAWD Staked</div>
          <div className="stat-value text-secondary">{formatClawd(totalStakedAll)}</div>
          {totalStakedUsd > 0.01 && (
            <div className="stat-desc">≈ ${totalStakedUsd.toFixed(2)} USD</div>
          )}
        </div>
        {address && clawdBalance !== undefined && (
          <div className="stat">
            <div className="stat-title">Your CLAWD Balance</div>
            <div className="stat-value text-accent">{formatClawd(clawdBalance)}</div>
            {balanceUsd > 0.01 && (
              <div className="stat-desc">≈ ${balanceUsd.toFixed(2)} USD</div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      <div className="text-center mb-6 max-w-lg">
        <p className="text-base-content/70">
          Stake your <span className="font-bold text-primary">$CLAWD</span> on the features you want built.
          The more staked, the louder the signal. Unstake anytime.
        </p>
      </div>

      {/* Admin section */}
      {isAdmin && (
        <div className="w-full mb-6">
          <CreateProposal refetchAllProposals={refetchAllProposals} />
        </div>
      )}

      {/* Filter toggle */}
      <div className="flex items-center gap-2 mb-4 self-end">
        <label className="label cursor-pointer gap-2">
          <span className="label-text text-sm">Show closed</span>
          <input
            type="checkbox"
            className="toggle toggle-sm"
            checked={showClosed}
            onChange={e => setShowClosed(e.target.checked)}
          />
        </label>
      </div>

      {/* Proposals leaderboard */}
      <div className="w-full space-y-4">
        {sortedProposals.length === 0 ? (
          <div className="text-center py-12 text-base-content/50">
            <p className="text-xl">📋 No proposals yet</p>
            <p className="text-sm mt-2">
              {isAdmin ? "Create the first proposal above!" : "Check back soon — proposals are coming!"}
            </p>
          </div>
        ) : (
          sortedProposals.map((proposal, rank) => (
            <ProposalCard
              key={proposal.originalIndex}
              proposal={proposal}
              proposalId={proposal.originalIndex}
              rank={rank}
              contractAddress={contractAddress}
              clawdPrice={clawdPrice}
              refetchAllProposals={refetchAllProposals}
              isAdmin={!!isAdmin}
            />
          ))
        )}
      </div>

      {/* Connect wallet prompt */}
      {!address && (
        <div className="mt-8 text-center">
          <p className="text-base-content/60">Connect your wallet to stake CLAWD on proposals</p>
        </div>
      )}
    </div>
  );
};

export default Home;
