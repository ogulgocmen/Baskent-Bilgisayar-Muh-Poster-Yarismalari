let currentElectionId = null;
let currentCode = null;
let selectedProjectIds = [];

document.getElementById("btnCheckCode").addEventListener("click", async () => {
    const codeInput = document.getElementById("votingCode").value.trim().toUpperCase();
    const msgElement = document.getElementById("loginMessage");

    if (codeInput.length !== 8) {
        msgElement.innerText = "Lütfen 8 haneli kodunuzu eksiksiz giriniz.";
        return;
    }

    msgElement.innerText = "Kod kontrol ediliyor...";

    // Kodu kontrol et
    const { data: codeData, error: codeError } = await supabaseClient
        .from("voting_codes")
        .select("election_id, used")
        .eq("code", codeInput)
        .single();

    if (codeError || !codeData) {
        msgElement.innerText = "Geçersiz kod girdiniz.";
        return;
    }

    if (codeData.used) {
        msgElement.innerText = "Bu kod daha önce kullanılmış!";
        return;
    }

    // Seçim AKTİF mi kontrol et
    const { data: electionData, error: elError } = await supabaseClient
        .from("elections")
        .select("status")
        .eq("id", codeData.election_id)
        .single();

    if (electionData.status !== "ACTIVE") {
        msgElement.innerText = "Bu yarışma için oylama şu anda aktif değil.";
        return;
    }

    // Başarılı Giriş
    currentElectionId = codeData.election_id;
    currentCode = codeInput;
    document.getElementById("loginSection").style.display = "none";
    document.getElementById("voteSection").style.display = "block";
    document.getElementById("submitSection").style.display = "block";
    
    loadPosters();
});

async function loadPosters() {
    const { data: projects, error } = await supabaseClient
        .from("projects")
        .select("id, project_no, project_name")
        .eq("election_id", currentElectionId)
        .order("project_no", { ascending: true });

    if (error) {
        alert("Posterler yüklenirken hata oluştu.");
        return;
    }

    const container = document.getElementById("posterContainer");
    container.innerHTML = "";

    projects.forEach(project => {
        const card = document.createElement("div");
        card.className = "poster-card";
        card.dataset.id = project.id;
        card.innerHTML = `
            <div class="poster-no">Poster ${project.project_no}</div>
            <div style="font-size: 14px; margin-top: 10px; color: #666;">${project.project_name || "İsimsiz Poster"}</div>
        `;

        card.addEventListener("click", () => toggleSelection(card, project.id));
        container.appendChild(card);
    });
}

function toggleSelection(cardElement, projectId) {
    const index = selectedProjectIds.indexOf(projectId);
    
    if (index > -1) {
        // Zaten seçiliyse, seçimi kaldır
        selectedProjectIds.splice(index, 1);
        cardElement.classList.remove("selected");
    } else {
        // Yeni seçim, limit kontrolü yap
        if (selectedProjectIds.length >= 5) {
            alert("En fazla 5 adet poster seçebilirsiniz.");
            return;
        }
        selectedProjectIds.push(projectId);
        cardElement.classList.add("selected");
    }
    
    document.getElementById("selectedCount").innerText = selectedProjectIds.length;
}

document.getElementById("btnSubmitVote").addEventListener("click", async () => {
    if (selectedProjectIds.length === 0) {
        alert("Lütfen en az 1 poster seçiniz.");
        return;
    }

    if (!confirm(`${selectedProjectIds.length} postere oy vermek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
        return;
    }

    const btn = document.getElementById("btnSubmitVote");
    btn.disabled = true;
    btn.innerText = "Oylar Gönderiliyor...";

    // Supabase RPC (Stored Procedure) çağrısı - Güvenli ve Anonim İşlem
    const { data, error } = await supabaseClient.rpc('cast_vote', {
        v_code: currentCode,
        v_project_ids: selectedProjectIds
    });

    if (error) {
        alert("Oy gönderilirken hata oluştu: " + error.message);
        btn.disabled = false;
        btn.innerText = "Oylarımı Gönder";
        return;
    }

    // Başarılı
    document.getElementById("voteSection").innerHTML = `
        <div style="text-align:center; padding: 50px;">
            <h1 style="color: #28a745;">Teşekkürler!</h1>
            <p>Oylarınız başarıyla kaydedildi.</p>
        </div>
    `;
    document.getElementById("submitSection").style.display = "none";
});